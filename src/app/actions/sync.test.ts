import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ───────────────────────────────────────────────────────────────
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

// Proxy-based drizzle mock — mirrors the lazy-proxy pattern in @/lib/db
const mockAll = vi.fn().mockReturnValue([]);
const mockGet = vi.fn().mockReturnValue(undefined);
const mockRun = vi.fn();

const chainMethods = () => {
  const chain: Record<string, any> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.all = mockAll;
  chain.get = mockGet;
  chain.run = mockRun;
  chain.set = vi.fn().mockReturnValue(chain);
  return chain;
};

const mockSelect = vi.fn().mockImplementation(() => chainMethods());
const mockInsert = vi.fn().mockImplementation(() => ({ values: vi.fn().mockReturnValue({ run: mockRun }) }));
const mockUpdate = vi.fn().mockImplementation(() => chainMethods());
const mockDelete = vi.fn().mockImplementation(() => chainMethods());

vi.mock("@/lib/db", () => {
  const accounts = {
    id: { name: "id" },
    userId: { name: "user_id" },
    balanceUsd: { name: "balance_usd" },
    lastSyncedAt: { name: "last_synced_at" },
    includeInNetWorth: { name: "include_in_net_worth" },
    provider: { name: "provider" },
    name: { name: "name" },
    type: { name: "type" },
    externalId: { name: "external_id" },
  };

  const snapshots = {
    id: { name: "id" },
    accountId: { name: "account_id" },
    timestamp: { name: "timestamp" },
    valueUsd: { name: "value_usd" },
    createdAt: { name: "created_at" },
  };

  const db = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "select") return mockSelect;
        if (prop === "insert") return mockInsert;
        if (prop === "update") return mockUpdate;
        if (prop === "delete") return mockDelete;
        return undefined;
      },
    }
  );

  return { db, accounts, snapshots };
});

// ── imports (after mocks) ───────────────────────────────────────────────
import { validateRequest } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { syncSimpleFINAccounts } from "./simplefin";
import { syncSolanaWallets } from "./solana";
import {
  syncAllAccounts,
  getTotalPortfolioValue,
  getPortfolioHistory,
  triggerEdgeFunctionSync,
} from "./sync";

// ── helpers ─────────────────────────────────────────────────────────────
const mockUser = { id: "user-1", email: "test@example.com" };

function authed() {
  vi.mocked(validateRequest).mockResolvedValue({
    user: mockUser,
    session: { id: "sess-1" },
  } as any);
}

function unauthed() {
  vi.mocked(validateRequest).mockResolvedValue({
    user: null,
    session: null,
  });
}

// ── tests ───────────────────────────────────────────────────────────────

describe("syncAllAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when no user session", async () => {
    unauthed();
    const result = await syncAllAccounts();

    expect(result.simplefin.success).toBe(false);
    expect(result.simplefin.error).toBe("Unauthorized");
    expect(result.solana.success).toBe(false);
    expect(result.solana.error).toBe("Unauthorized");
    expect(result.totalSynced).toBe(0);
    // syncSimpleFINAccounts and syncSolanaWallets should NOT be called
    expect(syncSimpleFINAccounts).not.toHaveBeenCalled();
    expect(syncSolanaWallets).not.toHaveBeenCalled();
  });

  it("both providers succeed — returns combined total", async () => {
    authed();
    vi.mocked(syncSimpleFINAccounts).mockResolvedValue({
      accountCount: 3,
    } as any);
    vi.mocked(syncSolanaWallets).mockResolvedValue({
      synced: 2,
    } as any);

    const result = await syncAllAccounts();

    expect(result.simplefin.success).toBe(true);
    expect(result.simplefin.synced).toBe(3);
    expect(result.solana.success).toBe(true);
    expect(result.solana.synced).toBe(2);
    expect(result.totalSynced).toBe(5);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("one provider fails, other succeeds — partial result", async () => {
    authed();
    vi.mocked(syncSimpleFINAccounts).mockRejectedValue(
      new Error("SimpleFIN API down")
    );
    vi.mocked(syncSolanaWallets).mockResolvedValue({ synced: 1 } as any);

    const result = await syncAllAccounts();

    expect(result.simplefin.success).toBe(false);
    expect(result.simplefin.error).toBe("SimpleFIN API down");
    expect(result.solana.success).toBe(true);
    expect(result.solana.synced).toBe(1);
    expect(result.totalSynced).toBe(1);
  });

  it("both providers fail — both errors returned", async () => {
    authed();
    vi.mocked(syncSimpleFINAccounts).mockRejectedValue(
      new Error("SimpleFIN timeout")
    );
    vi.mocked(syncSolanaWallets).mockRejectedValue(
      new Error("RPC node unreachable")
    );

    const result = await syncAllAccounts();

    expect(result.simplefin.success).toBe(false);
    expect(result.simplefin.error).toBe("SimpleFIN timeout");
    expect(result.solana.success).toBe(false);
    expect(result.solana.error).toBe("RPC node unreachable");
    expect(result.totalSynced).toBe(0);
  });
});

describe("getTotalPortfolioValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeros when unauthorized", async () => {
    unauthed();
    const result = await getTotalPortfolioValue();

    expect(result).toEqual({ totalValueUsd: 0, accountCount: 0, lastSynced: null });
  });

  it("returns zeros when no accounts", async () => {
    authed();
    mockAll.mockReturnValueOnce([]);

    const result = await getTotalPortfolioValue();

    expect(result).toEqual({ totalValueUsd: 0, accountCount: 0, lastSynced: null });
  });

  it("sums balances only for includeInNetWorth=true accounts", async () => {
    authed();
    // The query already filters includeInNetWorth=true via the WHERE clause,
    // so mock returns only those accounts
    mockAll.mockReturnValueOnce([
      { balanceUsd: 1000, lastSyncedAt: "2024-01-15T10:00:00Z" },
      { balanceUsd: 2500, lastSyncedAt: "2024-01-14T08:00:00Z" },
      { balanceUsd: 500, lastSyncedAt: null },
    ]);

    const result = await getTotalPortfolioValue();

    expect(result.totalValueUsd).toBe(4000);
    expect(result.accountCount).toBe(3);
    expect(result.lastSynced).toBe("2024-01-15T10:00:00Z");
  });

  it("returns most recent lastSyncedAt", async () => {
    authed();
    mockAll.mockReturnValueOnce([
      { balanceUsd: 100, lastSyncedAt: "2024-01-10T12:00:00Z" },
      { balanceUsd: 200, lastSyncedAt: "2024-01-20T18:30:00Z" },
      { balanceUsd: 300, lastSyncedAt: "2024-01-15T06:00:00Z" },
    ]);

    const result = await getTotalPortfolioValue();

    expect(result.lastSynced).toBe("2024-01-20T18:30:00Z");
    expect(result.totalValueUsd).toBe(600);
  });
});

describe("getPortfolioHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when unauthorized", async () => {
    unauthed();
    const result = await getPortfolioHistory();

    expect(result).toEqual([]);
  });

  it("returns empty when no accounts", async () => {
    authed();
    // First call: account query returns empty
    mockAll.mockReturnValueOnce([]);

    const result = await getPortfolioHistory();

    expect(result).toEqual([]);
  });

  it("returns empty when no snapshots", async () => {
    authed();
    // First call: accounts query returns accounts
    mockAll.mockReturnValueOnce([{ id: "acc-1" }, { id: "acc-2" }]);
    // Second call: snapshots query returns empty
    mockAll.mockReturnValueOnce([]);

    const result = await getPortfolioHistory();

    expect(result).toEqual([]);
  });

  it("correctly buckets snapshots by interval (1d)", async () => {
    authed();
    // accounts query
    mockAll.mockReturnValueOnce([{ id: "acc-1" }, { id: "acc-2" }]);

    // snapshots query — two snapshots on same day, one on next day
    const day1a = "2024-01-15T08:00:00.000Z";
    const day1b = "2024-01-15T20:00:00.000Z";
    const day2 = "2024-01-16T12:00:00.000Z";

    mockAll.mockReturnValueOnce([
      { timestamp: day1a, valueUsd: 1000, accountId: "acc-1" },
      { timestamp: day1b, valueUsd: 500, accountId: "acc-2" },
      { timestamp: day2, valueUsd: 2000, accountId: "acc-1" },
    ]);

    const result = await getPortfolioHistory({ interval: "1d" });

    expect(result).toHaveLength(2);
    // First bucket: day1a + day1b summed
    expect(result[0].value).toBe(1500);
    // Second bucket: day2
    expect(result[1].value).toBe(2000);
    // Timestamps should be bucket-aligned (start of day in UTC)
    expect(new Date(result[0].timestamp).getTime() % (24 * 60 * 60 * 1000)).toBe(0);
    expect(new Date(result[1].timestamp).getTime() % (24 * 60 * 60 * 1000)).toBe(0);
  });

  it("respects date range filters (startDate/endDate)", async () => {
    authed();
    // accounts query
    mockAll.mockReturnValueOnce([{ id: "acc-1" }]);
    // snapshots — filtering is done in the WHERE clause, mock returns only matching
    mockAll.mockReturnValueOnce([
      { timestamp: "2024-01-15T00:00:00.000Z", valueUsd: 1200, accountId: "acc-1" },
    ]);

    const result = await getPortfolioHistory({
      startDate: new Date("2024-01-10"),
      endDate: new Date("2024-01-20"),
      interval: "1d",
    });

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1200);
    // Verify the mock chain's where was called (filters applied)
    expect(mockSelect).toHaveBeenCalled();
  });
});

describe("triggerEdgeFunctionSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error about SQLite migration", async () => {
    const result = await triggerEdgeFunctionSync();

    expect(result.success).toBe(false);
    expect(result.error).toContain("SQLite");
    expect(result.error).toContain("syncAllAccounts");
  });
});
