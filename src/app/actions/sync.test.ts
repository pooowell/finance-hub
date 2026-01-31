import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Proxy-based db mock (queue pattern) — mirrors project convention
// ---------------------------------------------------------------------------
const { dbQueue, mockDb } = vi.hoisted(() => {
  const dbQueue: Array<unknown> = [];

  const createChain = (): unknown =>
    new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === "get" || prop === "all" || prop === "run") {
          return () => dbQueue.shift();
        }
        return createChain();
      },
      apply() {
        return createChain();
      },
    });

  const mockDb = createChain();
  return { dbQueue, mockDb };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/db", () => ({
  db: mockDb,
  accounts: {
    id: "id",
    userId: "user_id",
    includeInNetWorth: "include_in_net_worth",
    balanceUsd: "balance_usd",
    lastSyncedAt: "last_synced_at",
  },
  snapshots: {
    id: "id",
    accountId: "account_id",
    timestamp: "timestamp",
    valueUsd: "value_usd",
  },
  credentials: {
    id: "id",
    userId: "user_id",
    provider: "provider",
    accessToken: "access_token",
    updatedAt: "updated_at",
  },
}));

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("./simplefin", () => ({
  syncSimpleFINAccounts: vi.fn(),
}));

vi.mock("./solana", () => ({
  syncSolanaWallets: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (must come after vi.mock calls)
// ---------------------------------------------------------------------------
import { getPortfolioHistory, getTotalPortfolioValue } from "./sync";
import { validateRequest } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_USER = { id: "user-1", email: "test@example.com" };

function authed() {
  vi.mocked(validateRequest).mockResolvedValue({
    user: MOCK_USER,
    session: { id: "sess-1", userId: MOCK_USER.id, expiresAt: Date.now() },
  } as never);
}

function unauthed() {
  vi.mocked(validateRequest).mockResolvedValue({
    user: null,
    session: null,
  } as never);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tests — getPortfolioHistory
// ---------------------------------------------------------------------------
describe("getPortfolioHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQueue.length = 0;
  });

  it("returns [] when not authenticated", async () => {
    unauthed();
    const result = await getPortfolioHistory();
    expect(result).toEqual([]);
  });

  it("returns [] when user has no accounts", async () => {
    authed();
    // db.select().from().where().all() → accounts
    dbQueue.push([]);
    const result = await getPortfolioHistory();
    expect(result).toEqual([]);
  });

  it("returns [] when there are no snapshots", async () => {
    authed();
    // accounts query
    dbQueue.push([{ id: "acc-1" }]);
    // snapshots query
    dbQueue.push([]);
    const result = await getPortfolioHistory();
    expect(result).toEqual([]);
  });

  it("handles single account with snapshots across multiple buckets", async () => {
    authed();

    const day1 = new Date("2024-01-01T12:00:00Z").getTime();
    const day2 = new Date("2024-01-02T12:00:00Z").getTime();
    const day3 = new Date("2024-01-03T12:00:00Z").getTime();

    // accounts
    dbQueue.push([{ id: "acc-1" }]);
    // snapshots (ordered by timestamp asc)
    dbQueue.push([
      { accountId: "acc-1", timestamp: new Date(day1).toISOString(), valueUsd: 1000 },
      { accountId: "acc-1", timestamp: new Date(day2).toISOString(), valueUsd: 1100 },
      { accountId: "acc-1", timestamp: new Date(day3).toISOString(), valueUsd: 1200 },
    ]);

    const result = await getPortfolioHistory({ interval: "1d" });

    expect(result).toHaveLength(3);
    expect(result[0].value).toBe(1000);
    expect(result[1].value).toBe(1100);
    expect(result[2].value).toBe(1200);
  });

  it("carries forward last-known values for staggered multi-account snapshots", async () => {
    authed();

    // Three accounts, snapshots at different times:
    //   Day 1: acc-1=1000, acc-2=2000, acc-3=3000  → total 6000
    //   Day 2: acc-1=1100                           → total 6100 (acc-2 carry 2000, acc-3 carry 3000)
    //   Day 3: acc-2=2200                           → total 6300 (acc-1 carry 1100, acc-3 carry 3000)
    //   Day 4: acc-3=3400                           → total 6700 (acc-1 carry 1100, acc-2 carry 2200)

    const day1 = "2024-01-01T12:00:00.000Z";
    const day2 = "2024-01-02T12:00:00.000Z";
    const day3 = "2024-01-03T12:00:00.000Z";
    const day4 = "2024-01-04T12:00:00.000Z";

    // accounts
    dbQueue.push([{ id: "acc-1" }, { id: "acc-2" }, { id: "acc-3" }]);
    // snapshots (ordered by timestamp asc)
    dbQueue.push([
      { accountId: "acc-1", timestamp: day1, valueUsd: 1000 },
      { accountId: "acc-2", timestamp: day1, valueUsd: 2000 },
      { accountId: "acc-3", timestamp: day1, valueUsd: 3000 },
      { accountId: "acc-1", timestamp: day2, valueUsd: 1100 },
      { accountId: "acc-2", timestamp: day3, valueUsd: 2200 },
      { accountId: "acc-3", timestamp: day4, valueUsd: 3400 },
    ]);

    const result = await getPortfolioHistory({ interval: "1d" });

    expect(result).toHaveLength(4);
    expect(result[0].value).toBe(6000); // Day 1: 1000 + 2000 + 3000
    expect(result[1].value).toBe(6100); // Day 2: 1100 + 2000 + 3000
    expect(result[2].value).toBe(6300); // Day 3: 1100 + 2200 + 3000
    expect(result[3].value).toBe(6700); // Day 4: 1100 + 2200 + 3400
  });

  it("handles accounts that start reporting at different times", async () => {
    authed();

    // acc-1 starts on day 1, acc-2 starts on day 3
    //   Day 1: acc-1=500             → total 500
    //   Day 2: acc-1=600             → total 600
    //   Day 3: acc-1=700, acc-2=1000 → total 1700
    //   Day 4: acc-2=1100            → total 1800 (acc-1 carry 700)

    const day1 = "2024-01-01T12:00:00.000Z";
    const day2 = "2024-01-02T12:00:00.000Z";
    const day3 = "2024-01-03T12:00:00.000Z";
    const day4 = "2024-01-04T12:00:00.000Z";

    dbQueue.push([{ id: "acc-1" }, { id: "acc-2" }]);
    dbQueue.push([
      { accountId: "acc-1", timestamp: day1, valueUsd: 500 },
      { accountId: "acc-1", timestamp: day2, valueUsd: 600 },
      { accountId: "acc-1", timestamp: day3, valueUsd: 700 },
      { accountId: "acc-2", timestamp: day3, valueUsd: 1000 },
      { accountId: "acc-2", timestamp: day4, valueUsd: 1100 },
    ]);

    const result = await getPortfolioHistory({ interval: "1d" });

    expect(result).toHaveLength(4);
    expect(result[0].value).toBe(500);
    expect(result[1].value).toBe(600);
    expect(result[2].value).toBe(1700);
    expect(result[3].value).toBe(1800);
  });

  it("only includes accounts with includeInNetWorth=true (excluded accounts filtered by DB query)", async () => {
    authed();

    // The DB query filters by includeInNetWorth=true, so only included
    // account IDs are returned. Snapshots for excluded accounts won't match.
    // We verify the function works correctly with the filtered set.

    const day1 = "2024-01-01T12:00:00.000Z";
    const day2 = "2024-01-02T12:00:00.000Z";

    // Only acc-1 is included (acc-2 excluded by DB query, not returned)
    dbQueue.push([{ id: "acc-1" }]);
    // Only snapshots for included accounts come back from the DB
    dbQueue.push([
      { accountId: "acc-1", timestamp: day1, valueUsd: 5000 },
      { accountId: "acc-1", timestamp: day2, valueUsd: 5500 },
    ]);

    const result = await getPortfolioHistory({ interval: "1d" });

    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(5000);
    expect(result[1].value).toBe(5500);
  });

  it("multiple snapshots in same bucket take the latest per-account value", async () => {
    authed();

    // Two snapshots for acc-1 in the same day bucket
    const ts1 = "2024-01-01T08:00:00.000Z";
    const ts2 = "2024-01-01T16:00:00.000Z"; // same day bucket
    const ts3 = "2024-01-02T12:00:00.000Z";

    dbQueue.push([{ id: "acc-1" }, { id: "acc-2" }]);
    dbQueue.push([
      { accountId: "acc-1", timestamp: ts1, valueUsd: 1000 },
      { accountId: "acc-2", timestamp: ts1, valueUsd: 2000 },
      { accountId: "acc-1", timestamp: ts2, valueUsd: 1500 }, // updates acc-1 in same bucket
      { accountId: "acc-2", timestamp: ts3, valueUsd: 2500 },
    ]);

    const result = await getPortfolioHistory({ interval: "1d" });

    expect(result).toHaveLength(2);
    // Day 1: acc-1 final=1500, acc-2=2000 → 3500
    expect(result[0].value).toBe(3500);
    // Day 2: acc-1 carry=1500, acc-2=2500 → 4000
    expect(result[1].value).toBe(4000);
  });

  it("respects different interval sizes", async () => {
    authed();

    // Snapshots 2 hours apart with 1h interval
    const h1 = "2024-01-01T01:00:00.000Z";
    const h2 = "2024-01-01T03:00:00.000Z";

    dbQueue.push([{ id: "acc-1" }]);
    dbQueue.push([
      { accountId: "acc-1", timestamp: h1, valueUsd: 100 },
      { accountId: "acc-1", timestamp: h2, valueUsd: 200 },
    ]);

    const result = await getPortfolioHistory({ interval: "1h" });

    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(100);
    expect(result[1].value).toBe(200);
  });

  it("results are sorted chronologically", async () => {
    authed();

    const day1 = "2024-01-01T12:00:00.000Z";
    const day2 = "2024-01-02T12:00:00.000Z";
    const day3 = "2024-01-03T12:00:00.000Z";

    dbQueue.push([{ id: "acc-1" }]);
    dbQueue.push([
      { accountId: "acc-1", timestamp: day1, valueUsd: 100 },
      { accountId: "acc-1", timestamp: day2, valueUsd: 200 },
      { accountId: "acc-1", timestamp: day3, valueUsd: 300 },
    ]);

    const result = await getPortfolioHistory({ interval: "1d" });

    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i].timestamp).getTime()).toBeGreaterThan(
        new Date(result[i - 1].timestamp).getTime()
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — getTotalPortfolioValue
// ---------------------------------------------------------------------------
describe("getTotalPortfolioValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQueue.length = 0;
  });

  it("returns zeros when not authenticated", async () => {
    unauthed();
    const result = await getTotalPortfolioValue();
    expect(result).toEqual({ totalValueUsd: 0, accountCount: 0, lastSynced: null });
  });

  it("returns zeros when user has no accounts", async () => {
    authed();
    dbQueue.push([]);
    const result = await getTotalPortfolioValue();
    expect(result).toEqual({ totalValueUsd: 0, accountCount: 0, lastSynced: null });
  });

  it("sums balances across accounts", async () => {
    authed();
    dbQueue.push([
      { balanceUsd: 1000, lastSyncedAt: "2024-01-01T00:00:00Z" },
      { balanceUsd: 2500.50, lastSyncedAt: "2024-01-02T00:00:00Z" },
      { balanceUsd: null, lastSyncedAt: null },
    ]);
    const result = await getTotalPortfolioValue();
    expect(result.totalValueUsd).toBe(3500.50);
    expect(result.accountCount).toBe(3);
    expect(result.lastSynced).toBe("2024-01-02T00:00:00Z");
  });
});
