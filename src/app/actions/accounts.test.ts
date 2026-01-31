import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that touches the mocked modules
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// We mock the entire db module so we never touch a real SQLite file.
// Each chainable method returns `this` so calls like
//   db.select().from().where().get()   resolve correctly.
vi.mock("@/lib/db", () => {
  const chainable = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const self = new Proxy(chain, {
      get(target, prop: string) {
        if (!target[prop]) {
          target[prop] = vi.fn().mockReturnValue(self);
        }
        return target[prop];
      },
    });
    return self;
  };

  return {
    db: chainable(),
    accounts: { id: "id", userId: "userId", name: "name" },
    transactions: { accountId: "accountId", postedAt: "postedAt" },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { validateRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  updateAccount,
  getRecentTransactions,
  getAllTransactions,
} from "./accounts";

// Typed helpers so TS doesn't complain about mock methods
const mockValidateRequest = vi.mocked(validateRequest);
const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeUser = { id: "user-1", email: "a@b.com" };
const fakeSession = { id: "sess-1", userId: fakeUser.id, expiresAt: new Date() };

/** Reset every mock fn hanging off the db proxy and all other mocks */
function resetDbChain() {
  // The proxy creates fns lazily — clear any that exist
  for (const key of Object.keys(mockDb)) {
    if (typeof mockDb[key]?.mockReset === "function") {
      mockDb[key].mockReset().mockReturnValue(mockDb);
    }
  }
}

/** Wire up the db proxy so a select→from→where→get chain returns `value` */
function mockSelectGet(value: unknown) {
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);
  mockDb.get.mockReturnValue(value);
}

/** Wire up select→from→where→orderBy→limit→all (for transaction queries) */
function mockSelectAll(value: unknown[]) {
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);
  mockDb.orderBy.mockReturnValue(mockDb);
  mockDb.limit.mockReturnValue(mockDb);
  mockDb.all.mockReturnValue(value);
}

/** Wire up update→set→where→run */
function mockUpdateRun() {
  mockDb.update.mockReturnValue(mockDb);
  mockDb.set.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);
  mockDb.run.mockReturnValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbChain();
  });

  it("returns error when not authenticated", async () => {
    mockValidateRequest.mockResolvedValue({ user: null, session: null });

    const result = await updateAccount("acc-1", { is_hidden: true });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    // db should never be touched
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns error when account not found", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });
    mockSelectGet(undefined); // no row

    const result = await updateAccount("nonexistent", { is_hidden: false });

    expect(result).toEqual({ success: false, error: "Account not found" });
  });

  it("returns error when user does not own the account", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });
    mockSelectGet({ id: "acc-1", userId: "someone-else" });

    const result = await updateAccount("acc-1", { is_hidden: true });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("succeeds and calls revalidatePath when valid", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });
    mockSelectGet({ id: "acc-1", userId: fakeUser.id });
    mockUpdateRun();

    const result = await updateAccount("acc-1", {
      is_hidden: false,
      include_in_net_worth: true,
      category: "checking",
    });

    expect(result).toEqual({ success: true });
    expect(mockDb.update).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns error message when db.update throws", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });
    mockSelectGet({ id: "acc-1", userId: fakeUser.id });

    // Make the run step throw
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.run.mockImplementation(() => {
      throw new Error("disk full");
    });

    const result = await updateAccount("acc-1", { is_hidden: true });

    expect(result).toEqual({ success: false, error: "disk full" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("getRecentTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbChain();
  });

  it("returns empty array + error when not authenticated", async () => {
    mockValidateRequest.mockResolvedValue({ user: null, session: null });

    const result = await getRecentTransactions();

    expect(result).toEqual({ transactions: [], error: "Unauthorized" });
  });

  it("returns empty array when user has no accounts", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });

    mockSelectAll([]);

    const result = await getRecentTransactions(5);

    expect(result).toEqual({ transactions: [] });
  });

  it("returns transactions with correct account_name mapping", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });

    const userAccounts = [
      { id: "acc-1", name: "Checking" },
      { id: "acc-2", name: "Savings" },
    ];

    const rawTxs = [
      {
        id: "tx-1",
        accountId: "acc-1",
        externalId: "ext-1",
        postedAt: "2024-01-15",
        amount: -50,
        description: "Coffee",
        payee: null,
        memo: null,
        pending: false,
        labelId: null,
        createdAt: "2024-01-15",
      },
      {
        id: "tx-2",
        accountId: "acc-2",
        externalId: "ext-2",
        postedAt: "2024-01-14",
        amount: 1000,
        description: "Payroll",
        payee: null,
        memo: null,
        pending: false,
        labelId: null,
        createdAt: "2024-01-14",
      },
    ];

    // The action calls db twice: once for accounts (.all), once for txs (.all)
    let callCount = 0;
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.limit.mockReturnValue(mockDb);
    mockDb.all.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? userAccounts : rawTxs;
    });

    const result = await getRecentTransactions(10);

    expect(result.error).toBeUndefined();
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].account_name).toBe("Checking");
    expect(result.transactions[1].account_name).toBe("Savings");
  });

  it("uses 'Unknown Account' when account id not in map", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });

    let callCount = 0;
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.limit.mockReturnValue(mockDb);
    mockDb.all.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "acc-1", name: "Checking" }];
      return [
        {
          id: "tx-1",
          accountId: "acc-unknown",
          externalId: "ext-1",
          postedAt: "2024-01-15",
          amount: -10,
          description: "Mystery",
          payee: null,
          memo: null,
          pending: false,
          labelId: null,
          createdAt: "2024-01-15",
        },
      ];
    });

    const result = await getRecentTransactions(5);

    expect(result.transactions[0].account_name).toBe("Unknown Account");
  });
});

// ---------------------------------------------------------------------------

describe("getAllTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbChain();
  });

  it("returns error when not authenticated", async () => {
    mockValidateRequest.mockResolvedValue({ user: null, session: null });

    const result = await getAllTransactions();

    expect(result).toEqual({
      transactions: [],
      summaries: [],
      error: "Unauthorized",
    });
  });

  it("returns empty when user has no accounts", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });

    mockSelectAll([]);

    const result = await getAllTransactions();

    expect(result).toEqual({ transactions: [], summaries: [] });
  });

  it("returns spending summaries with correct calculations", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });

    const now = new Date();
    const hoursAgo = (h: number) =>
      new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

    const rawTxs = [
      // Within last 24h
      {
        id: "tx-1",
        accountId: "acc-1",
        externalId: "ext-1",
        postedAt: hoursAgo(2),
        amount: -100,
        description: "Groceries",
        payee: null,
        memo: null,
        pending: false,
        labelId: null,
        createdAt: hoursAgo(2),
      },
      // Within last 24h — income
      {
        id: "tx-2",
        accountId: "acc-1",
        externalId: "ext-2",
        postedAt: hoursAgo(6),
        amount: 500,
        description: "Freelance",
        payee: null,
        memo: null,
        pending: false,
        labelId: null,
        createdAt: hoursAgo(6),
      },
      // 3 days ago — within 7d but outside 1d
      {
        id: "tx-3",
        accountId: "acc-1",
        externalId: "ext-3",
        postedAt: hoursAgo(72),
        amount: -200,
        description: "Utilities",
        payee: null,
        memo: null,
        pending: false,
        labelId: null,
        createdAt: hoursAgo(72),
      },
    ];

    let callCount = 0;
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.all.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "acc-1", name: "Main" }];
      return rawTxs;
    });

    const result = await getAllTransactions();

    expect(result.error).toBeUndefined();
    expect(result.transactions).toHaveLength(3);

    // Check account_name mapping
    expect(result.transactions[0].account_name).toBe("Main");

    // Verify summaries structure
    expect(result.summaries).toHaveLength(4);

    const s1d = result.summaries.find((s) => s.period === "1d")!;
    expect(s1d.label).toBe("24 Hours");
    expect(s1d.spending).toBe(100); // |−100|
    expect(s1d.income).toBe(500);
    expect(s1d.net).toBe(400); // 500 − 100
    expect(s1d.transactionCount).toBe(2);

    const s1w = result.summaries.find((s) => s.period === "1w")!;
    expect(s1w.label).toBe("7 Days");
    expect(s1w.spending).toBe(300); // 100 + 200
    expect(s1w.income).toBe(500);
    expect(s1w.net).toBe(200);
    expect(s1w.transactionCount).toBe(3);

    // 30d and 1y should include everything too
    const s1m = result.summaries.find((s) => s.period === "1m")!;
    expect(s1m.transactionCount).toBe(3);

    const s1y = result.summaries.find((s) => s.period === "1y")!;
    expect(s1y.transactionCount).toBe(3);
  });

  it("handles positive-only transactions (income, no spending)", async () => {
    mockValidateRequest.mockResolvedValue({
      user: fakeUser,
      session: fakeSession,
    });

    const now = new Date();
    const rawTxs = [
      {
        id: "tx-1",
        accountId: "acc-1",
        externalId: "ext-1",
        postedAt: new Date(now.getTime() - 1000).toISOString(),
        amount: 250,
        description: "Refund",
        payee: null,
        memo: null,
        pending: false,
        labelId: null,
        createdAt: new Date(now.getTime() - 1000).toISOString(),
      },
    ];

    let callCount = 0;
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.all.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "acc-1", name: "Wallet" }];
      return rawTxs;
    });

    const result = await getAllTransactions();

    const s1d = result.summaries.find((s) => s.period === "1d")!;
    expect(s1d.spending).toBe(0);
    expect(s1d.income).toBe(250);
    expect(s1d.net).toBe(250);
  });
});
