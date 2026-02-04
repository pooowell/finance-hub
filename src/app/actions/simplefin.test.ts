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
  accounts: { id: "id", userId: "user_id", externalId: "external_id", provider: "provider", name: "name", balanceUsd: "balance_usd" },
  credentials: { id: "id", userId: "user_id", provider: "provider", accessToken: "access_token", updatedAt: "updated_at" },
  snapshots: { id: "id", accountId: "account_id", timestamp: "timestamp", valueUsd: "value_usd" },
  transactions: { id: "id", accountId: "account_id", externalId: "external_id", postedAt: "posted_at", amount: "amount", description: "description", payee: "payee", memo: "memo", pending: "pending" },
}));

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(),
}));

vi.mock("lucia", () => ({
  generateIdFromEntropySize: vi.fn(),
}));

vi.mock("@/lib/simplefin", () => ({
  claimSetupToken: vi.fn(),
  fetchAccounts: vi.fn(),
  transformAccounts: vi.fn(),
  transformTransactions: vi.fn(),
  createSnapshot: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (must come after vi.mock calls)
// ---------------------------------------------------------------------------
import {
  connectSimpleFIN,
  syncSimpleFINAccounts,
  getSimpleFINAccounts,
} from "./simplefin";

import { validateRequest } from "@/lib/auth";
import { generateIdFromEntropySize } from "lucia";
import {
  claimSetupToken,
  fetchAccounts,
  transformAccounts,
  transformTransactions,
  createSnapshot,
} from "@/lib/simplefin";
import { revalidatePath } from "next/cache";

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

const MOCK_ACCESS_URL = "https://user:pass@bridge.simplefin.org/simplefin";

const MOCK_SIMPLEFIN_ACCOUNT = {
  id: "ACT-123",
  name: "Checking",
  currency: "USD",
  balance: "1500.50",
  "available-balance": "1400.00",
  "balance-date": 1700000000,
  org: { domain: "bank.example.com", name: "Example Bank", "sfin-url": "" },
  transactions: [
    {
      id: "TX-001",
      posted: 1700000000,
      amount: "-42.50",
      description: "Coffee Shop",
      payee: "Starbucks",
      memo: null,
      pending: false,
    },
    {
      id: "TX-002",
      posted: 1700100000,
      amount: "2000.00",
      description: "Direct Deposit",
      payee: "Employer Inc",
      memo: "Payroll",
      pending: false,
    },
  ],
};

const MOCK_ACCOUNT_SET = {
  errors: [],
  accounts: [MOCK_SIMPLEFIN_ACCOUNT],
};

const MOCK_TRANSFORMED_ACCOUNT = {
  user_id: MOCK_USER.id,
  provider: "SimpleFIN",
  name: "Example Bank - Checking",
  type: "checking",
  balance_usd: 1500.5,
  external_id: "ACT-123",
  metadata: {
    org_domain: "bank.example.com",
    org_name: "Example Bank",
    currency: "USD",
    available_balance: "1400.00",
  },
  last_synced_at: "2024-01-01T00:00:00.000Z",
};

const MOCK_TRANSFORMED_TXS = [
  {
    account_id: "acc-1",
    external_id: "TX-001",
    posted_at: "2023-11-14T22:13:20.000Z",
    amount: -42.5,
    description: "Coffee Shop",
    payee: "Starbucks",
    memo: null,
    pending: false,
  },
  {
    account_id: "acc-1",
    external_id: "TX-002",
    posted_at: "2023-11-16T01:46:40.000Z",
    amount: 2000.0,
    description: "Direct Deposit",
    payee: "Employer Inc",
    memo: "Payroll",
    pending: false,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SimpleFIN server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQueue.length = 0;
  });

  // =========================================================================
  // connectSimpleFIN
  // =========================================================================
  describe("connectSimpleFIN", () => {
    it("returns Unauthorized when not logged in", async () => {
      unauthed();
      const result = await connectSimpleFIN("any-token");
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("returns error when claimSetupToken fails", async () => {
      authed();
      vi.mocked(claimSetupToken).mockRejectedValue(
        new Error("Failed to claim setup token: Forbidden")
      );

      const result = await connectSimpleFIN("bad-token");
      expect(result).toEqual({
        error: "Failed to claim token: Failed to claim setup token: Forbidden",
      });
      expect(claimSetupToken).toHaveBeenCalledWith("bad-token");
    });

    it("connects successfully with new credential (no existing)", async () => {
      authed();
      vi.mocked(claimSetupToken).mockResolvedValue(MOCK_ACCESS_URL);

      // db.select().from().where().get() → no existing credential
      dbQueue.push(undefined);
      // db.insert(credentials).values().run()
      dbQueue.push(undefined);

      // syncSimpleFINAccounts will call validateRequest again
      vi.mocked(validateRequest).mockResolvedValue({
        user: MOCK_USER,
        session: { id: "sess-1", userId: MOCK_USER.id, expiresAt: Date.now() },
      } as never);

      // sync: fetchAccounts
      vi.mocked(fetchAccounts).mockResolvedValue(MOCK_ACCOUNT_SET as never);
      vi.mocked(transformAccounts).mockReturnValue([MOCK_TRANSFORMED_ACCOUNT]);

      // sync: check existing account → not found
      dbQueue.push(undefined);

      vi.mocked(generateIdFromEntropySize)
        .mockReturnValueOnce("acc-new-1")   // new account id
        .mockReturnValueOnce("snap-new-1"); // initial snapshot id

      // sync: insert account .run()
      dbQueue.push(undefined);

      vi.mocked(createSnapshot).mockReturnValue({
        account_id: "acc-new-1",
        value_usd: 1500.5,
        timestamp: "2024-01-01T00:00:00.000Z",
      });

      // sync: insert snapshot .run()
      dbQueue.push(undefined);

      // sync: transformTransactions
      vi.mocked(transformTransactions).mockReturnValue(MOCK_TRANSFORMED_TXS);

      // sync: check existing tx TX-001 → not found; insert .run()
      dbQueue.push(undefined); // select existing tx
      vi.mocked(generateIdFromEntropySize).mockReturnValueOnce("tx-new-1");
      dbQueue.push(undefined); // insert tx

      // sync: check existing tx TX-002 → not found; insert .run()
      dbQueue.push(undefined); // select existing tx
      vi.mocked(generateIdFromEntropySize).mockReturnValueOnce("tx-new-2");
      dbQueue.push(undefined); // insert tx

      const result = await connectSimpleFIN("valid-setup-token");

      expect(result).toEqual({ success: true, accountCount: 1 });
      expect(claimSetupToken).toHaveBeenCalledWith("valid-setup-token");
      expect(fetchAccounts).toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("upserts credential when one already exists", async () => {
      authed();
      vi.mocked(claimSetupToken).mockResolvedValue(MOCK_ACCESS_URL);

      // db.select().from().where().get() → existing credential found
      dbQueue.push({ id: "cred-existing" });
      // db.update(credentials).set().where().run()
      dbQueue.push(undefined);

      // syncSimpleFINAccounts: validateRequest
      vi.mocked(validateRequest).mockResolvedValue({
        user: MOCK_USER,
        session: { id: "sess-1", userId: MOCK_USER.id, expiresAt: Date.now() },
      } as never);

      // sync with no accounts
      vi.mocked(fetchAccounts).mockResolvedValue({
        errors: [],
        accounts: [],
      } as never);
      vi.mocked(transformAccounts).mockReturnValue([]);

      const result = await connectSimpleFIN("another-token");

      expect(result).toEqual({ success: true, accountCount: 0 });
      expect(claimSetupToken).toHaveBeenCalledWith("another-token");
    });

    it("returns error when sync fails after successful claim", async () => {
      authed();
      vi.mocked(claimSetupToken).mockResolvedValue(MOCK_ACCESS_URL);

      // no existing credential
      dbQueue.push(undefined);
      // insert credential
      dbQueue.push(undefined);

      vi.mocked(generateIdFromEntropySize).mockReturnValueOnce("cred-id-1");

      // syncSimpleFINAccounts: validateRequest
      vi.mocked(validateRequest).mockResolvedValue({
        user: MOCK_USER,
        session: { id: "sess-1", userId: MOCK_USER.id, expiresAt: Date.now() },
      } as never);

      // fetchAccounts throws
      vi.mocked(fetchAccounts).mockRejectedValue(new Error("Network error"));

      const result = await connectSimpleFIN("token-sync-fail");

      expect(result).toEqual({ error: "Failed to fetch accounts: Network error" });
    });
  });

  // =========================================================================
  // syncSimpleFINAccounts
  // =========================================================================
  describe("syncSimpleFINAccounts", () => {
    it("returns Unauthorized when not logged in", async () => {
      unauthed();
      const result = await syncSimpleFINAccounts();
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("uses provided accessUrl parameter", async () => {
      authed();

      vi.mocked(fetchAccounts).mockResolvedValue({
        errors: [],
        accounts: [],
      } as never);
      vi.mocked(transformAccounts).mockReturnValue([]);

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({ success: true, accountCount: 0 });
      expect(fetchAccounts).toHaveBeenCalledWith(
        { accessUrl: MOCK_ACCESS_URL },
        expect.objectContaining({ startDate: expect.any(Date) })
      );
    });

    it("looks up accessUrl from DB when not provided", async () => {
      authed();

      // db.select().from().where().get() → credential
      dbQueue.push({ accessToken: MOCK_ACCESS_URL });

      vi.mocked(fetchAccounts).mockResolvedValue({
        errors: [],
        accounts: [],
      } as never);
      vi.mocked(transformAccounts).mockReturnValue([]);

      const result = await syncSimpleFINAccounts();

      expect(result).toEqual({ success: true, accountCount: 0 });
      expect(fetchAccounts).toHaveBeenCalledWith(
        { accessUrl: MOCK_ACCESS_URL },
        expect.objectContaining({ startDate: expect.any(Date) })
      );
    });

    it("returns error when no credentials found in DB", async () => {
      authed();

      // db.select().from().where().get() → no credential
      dbQueue.push(undefined);

      const result = await syncSimpleFINAccounts();

      expect(result).toEqual({
        error: "No SimpleFIN credentials found. Please reconnect your account.",
      });
      expect(fetchAccounts).not.toHaveBeenCalled();
    });

    it("returns error when credential has null accessToken", async () => {
      authed();

      // db.select().from().where().get() → credential with null token
      dbQueue.push({ accessToken: null });

      const result = await syncSimpleFINAccounts();

      expect(result).toEqual({
        error: "No SimpleFIN credentials found. Please reconnect your account.",
      });
    });

    it("returns error when fetchAccounts fails", async () => {
      authed();

      vi.mocked(fetchAccounts).mockRejectedValue(
        new Error("SimpleFIN access denied. Please reconnect your account.")
      );

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({
        error: "Failed to fetch accounts: SimpleFIN access denied. Please reconnect your account.",
      });
    });

    it("inserts new account with initial snapshot and transactions", async () => {
      authed();

      vi.mocked(fetchAccounts).mockResolvedValue(MOCK_ACCOUNT_SET as never);
      vi.mocked(transformAccounts).mockReturnValue([MOCK_TRANSFORMED_ACCOUNT]);

      // check existing account → not found
      dbQueue.push(undefined);

      vi.mocked(generateIdFromEntropySize)
        .mockReturnValueOnce("acc-new-1")   // account id
        .mockReturnValueOnce("snap-init-1"); // snapshot id

      // insert account .run()
      dbQueue.push(undefined);

      vi.mocked(createSnapshot).mockReturnValue({
        account_id: "acc-new-1",
        value_usd: 1500.5,
        timestamp: "2024-01-01T00:00:00.000Z",
      });

      // insert snapshot .run()
      dbQueue.push(undefined);

      vi.mocked(transformTransactions).mockReturnValue(MOCK_TRANSFORMED_TXS);

      // TX-001: no existing → insert
      dbQueue.push(undefined); // select
      vi.mocked(generateIdFromEntropySize).mockReturnValueOnce("tx-1");
      dbQueue.push(undefined); // insert

      // TX-002: no existing → insert
      dbQueue.push(undefined); // select
      vi.mocked(generateIdFromEntropySize).mockReturnValueOnce("tx-2");
      dbQueue.push(undefined); // insert

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({ success: true, accountCount: 1 });
      expect(createSnapshot).toHaveBeenCalledWith("acc-new-1", 1500.5);
      expect(transformTransactions).toHaveBeenCalledWith(
        MOCK_SIMPLEFIN_ACCOUNT.transactions,
        "acc-new-1"
      );
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("updates existing account and creates snapshot on balance change", async () => {
      authed();

      vi.mocked(fetchAccounts).mockResolvedValue(MOCK_ACCOUNT_SET as never);
      vi.mocked(transformAccounts).mockReturnValue([MOCK_TRANSFORMED_ACCOUNT]);

      // check existing account → found with different balance
      dbQueue.push({ id: "acc-existing", balanceUsd: 1000.0 });

      // update account .run()
      dbQueue.push(undefined);

      vi.mocked(createSnapshot).mockReturnValue({
        account_id: "acc-existing",
        value_usd: 1500.5,
        timestamp: "2024-01-01T00:00:00.000Z",
      });

      vi.mocked(generateIdFromEntropySize).mockReturnValueOnce("snap-change-1");

      // insert snapshot .run()
      dbQueue.push(undefined);

      vi.mocked(transformTransactions).mockReturnValue(MOCK_TRANSFORMED_TXS);

      // TX-001: existing → update
      dbQueue.push({ id: "tx-existing-1" }); // select
      dbQueue.push(undefined); // update

      // TX-002: new → insert
      dbQueue.push(undefined); // select
      vi.mocked(generateIdFromEntropySize).mockReturnValueOnce("tx-new-2");
      dbQueue.push(undefined); // insert

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({ success: true, accountCount: 1 });
      expect(createSnapshot).toHaveBeenCalledWith("acc-existing", 1500.5);
    });

    it("skips snapshot when balance is unchanged", async () => {
      authed();

      vi.mocked(fetchAccounts).mockResolvedValue({
        errors: [],
        accounts: [{ ...MOCK_SIMPLEFIN_ACCOUNT, transactions: [] }],
      } as never);
      vi.mocked(transformAccounts).mockReturnValue([MOCK_TRANSFORMED_ACCOUNT]);

      // check existing account → found with same balance
      dbQueue.push({ id: "acc-existing", balanceUsd: 1500.5 });

      // update account .run()
      dbQueue.push(undefined);

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({ success: true, accountCount: 1 });
      expect(createSnapshot).not.toHaveBeenCalled();
    });

    it("updates existing transactions instead of inserting", async () => {
      authed();

      vi.mocked(fetchAccounts).mockResolvedValue(MOCK_ACCOUNT_SET as never);
      vi.mocked(transformAccounts).mockReturnValue([MOCK_TRANSFORMED_ACCOUNT]);

      // existing account, same balance (no snapshot)
      dbQueue.push({ id: "acc-1", balanceUsd: 1500.5 });
      // update account
      dbQueue.push(undefined);

      vi.mocked(transformTransactions).mockReturnValue(MOCK_TRANSFORMED_TXS);

      // Both transactions exist → update
      dbQueue.push({ id: "tx-exist-1" }); // TX-001 select
      dbQueue.push(undefined);             // TX-001 update
      dbQueue.push({ id: "tx-exist-2" }); // TX-002 select
      dbQueue.push(undefined);             // TX-002 update

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({ success: true, accountCount: 1 });
    });

    it("handles accounts with no transactions", async () => {
      authed();

      const accountNoTx = { ...MOCK_SIMPLEFIN_ACCOUNT, transactions: [] };
      vi.mocked(fetchAccounts).mockResolvedValue({
        errors: [],
        accounts: [accountNoTx],
      } as never);
      vi.mocked(transformAccounts).mockReturnValue([MOCK_TRANSFORMED_ACCOUNT]);

      // new account
      dbQueue.push(undefined);
      vi.mocked(generateIdFromEntropySize)
        .mockReturnValueOnce("acc-notx")
        .mockReturnValueOnce("snap-notx");

      // insert account
      dbQueue.push(undefined);

      vi.mocked(createSnapshot).mockReturnValue({
        account_id: "acc-notx",
        value_usd: 1500.5,
        timestamp: "2024-01-01T00:00:00.000Z",
      });

      // insert snapshot
      dbQueue.push(undefined);

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({ success: true, accountCount: 1 });
      expect(transformTransactions).not.toHaveBeenCalled();
    });

    it("logs warning when accountSet has errors but continues", async () => {
      authed();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      vi.mocked(fetchAccounts).mockResolvedValue({
        errors: ["Institution temporarily unavailable"],
        accounts: [],
      } as never);
      vi.mocked(transformAccounts).mockReturnValue([]);

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({ success: true, accountCount: 0 });
      expect(consoleSpy).toHaveBeenCalledWith(
        "[WARN] simplefin: SimpleFIN returned errors",
        { errors: ["Institution temporarily unavailable"] }
      );

      consoleSpy.mockRestore();
    });

    it("returns error on unexpected exception", async () => {
      authed();

      vi.mocked(fetchAccounts).mockResolvedValue(MOCK_ACCOUNT_SET as never);
      // Force transformAccounts to throw
      vi.mocked(transformAccounts).mockImplementation(() => {
        throw new Error("Unexpected parse failure");
      });

      const result = await syncSimpleFINAccounts(MOCK_ACCESS_URL);

      expect(result).toEqual({
        error: "Failed to sync accounts: Unexpected parse failure",
      });
    });
  });

  // =========================================================================
  // getSimpleFINAccounts
  // =========================================================================
  describe("getSimpleFINAccounts", () => {
    it("returns Unauthorized with empty accounts when not logged in", async () => {
      unauthed();
      const result = await getSimpleFINAccounts();
      expect(result).toEqual({ error: "Unauthorized", accounts: [] });
    });

    it("returns SimpleFIN accounts for authenticated user", async () => {
      authed();
      const mockAccounts = [
        {
          id: "acc-1",
          userId: MOCK_USER.id,
          provider: "SimpleFIN",
          name: "Example Bank - Checking",
          type: "checking",
          balanceUsd: 1500.5,
          externalId: "ACT-123",
          metadata: "{}",
          lastSyncedAt: "2024-01-01T00:00:00.000Z",
          isHidden: false,
          includeInNetWorth: true,
          category: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      // db.select().from().where().orderBy().all()
      dbQueue.push(mockAccounts);

      const result = await getSimpleFINAccounts();
      expect(result).toEqual({ accounts: mockAccounts });
    });

    it("returns empty accounts array when user has none", async () => {
      authed();
      dbQueue.push([]);

      const result = await getSimpleFINAccounts();
      expect(result).toEqual({ accounts: [] });
    });
  });
});
