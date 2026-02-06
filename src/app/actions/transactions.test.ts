import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Hoisted mock infrastructure (available inside vi.mock factories) ---

/** Chainable query proxy interface for type-safe mocking */
interface QueryChain {
  from: (..._args: unknown[]) => QueryChain;
  where: (..._args: unknown[]) => QueryChain;
  orderBy: (..._args: unknown[]) => QueryChain;
  set: (..._args: unknown[]) => QueryChain;
  values: (..._args: unknown[]) => QueryChain;
  limit: (..._args: unknown[]) => QueryChain;
  all: () => unknown;
  get: () => unknown;
  run: () => unknown;
}

const { dbQueue, mockDb, mockValidateRequest } = vi.hoisted(() => {
  const queue: Array<unknown> = [];

  function createChain(): QueryChain {
    return new Proxy({} as QueryChain, {
      get(_target, prop: string) {
        if (prop === "all") return () => queue.shift() ?? [];
        if (prop === "get") return () => queue.shift();
        if (prop === "run") return () => queue.shift() ?? { changes: 0 };
        // Chain methods (from, where, set, values, orderBy, etc.)
        return () => createChain();
      },
    });
  }

  return {
    dbQueue: queue,
    mockDb: new Proxy({} as Record<string, (...args: unknown[]) => QueryChain>, {
      get(_target, prop: string) {
        if (["select", "insert", "update", "delete"].includes(prop)) {
          return () => createChain();
        }
        return undefined;
      },
    }),
    mockValidateRequest: vi.fn(),
  };
});

vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema"
  );
  return { ...schema, db: mockDb };
});

vi.mock("@/lib/auth", () => ({
  validateRequest: mockValidateRequest,
  DEFAULT_USER_ID: "default",
}));

// --- Imports (after mocks) ---
import {
  getSpendingSummaries,
  getTransactionsForPeriod,
  getLabelsWithRules,
  createLabel,
  deleteLabel,
  labelTransaction,
  applyLabelRules,
  createLabelRule,
  deleteLabelRule,
} from "./transactions";

// --- Test fixtures ---
const mockUser = { id: "default" };

// Freeze time for deterministic period-based assertions
const now = new Date("2026-01-15T12:00:00Z");
const hoursAgo = (h: number) =>
  new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

const recentDate = hoursAgo(2); // 2 hours ago  -> within 1d
const threeDaysAgo = daysAgo(3); // 3 days ago   -> within 1w but not 1d
const fifteenDaysAgo = daysAgo(15); // 15 days ago  -> within 1m but not 1w

function authed() {
  mockValidateRequest.mockResolvedValue({ user: mockUser });
}

// ===================================================================
describe("transactions actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQueue.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------
  // Auth guards
  // ---------------------------------------------------------------
  describe("auth guards", () => {
    beforeEach(() => {
      mockValidateRequest.mockResolvedValue({ user: null });
    });

    it("getSpendingSummaries returns error when unauthenticated", async () => {
      const r = await getSpendingSummaries();
      expect(r).toEqual({ summaries: [], labels: [], error: "Unauthorized" });
    });

    it("getTransactionsForPeriod returns error when unauthenticated", async () => {
      const r = await getTransactionsForPeriod(7);
      expect(r).toEqual({
        transactions: [],
        topSpending: [],
        topIncome: [],
        error: "Unauthorized",
      });
    });

    it("getLabelsWithRules returns error when unauthenticated", async () => {
      const r = await getLabelsWithRules();
      expect(r).toEqual({ labels: [], error: "Unauthorized" });
    });

    it("createLabel returns error when unauthenticated", async () => {
      expect(await createLabel("X")).toEqual({ error: "Unauthorized" });
    });

    it("deleteLabel returns error when unauthenticated", async () => {
      expect(await deleteLabel("l1")).toEqual({
        success: false,
        error: "Unauthorized",
      });
    });

    it("labelTransaction returns error when unauthenticated", async () => {
      expect(await labelTransaction("t1", "l1")).toEqual({
        success: false,
        error: "Unauthorized",
      });
    });

    it("applyLabelRules returns error when unauthenticated", async () => {
      expect(await applyLabelRules()).toEqual({
        applied: 0,
        error: "Unauthorized",
      });
    });

    it("createLabelRule returns error when unauthenticated", async () => {
      expect(await createLabelRule("l1", "pat")).toEqual({
        success: false,
        error: "Unauthorized",
      });
    });

    it("deleteLabelRule returns error when unauthenticated", async () => {
      expect(await deleteLabelRule("r1")).toEqual({
        success: false,
        error: "Unauthorized",
      });
    });
  });

  // ---------------------------------------------------------------
  // getSpendingSummaries
  // ---------------------------------------------------------------
  describe("getSpendingSummaries", () => {
    beforeEach(authed);

    it("returns empty when user has no accounts", async () => {
      dbQueue.push([]); // userAccounts -> empty

      const r = await getSpendingSummaries();
      expect(r).toEqual({ summaries: [], labels: [] });
    });

    it("returns correct spending / income / net for each period", async () => {
      // DB call order: accounts -> labels -> allTransactions
      dbQueue.push([{ id: "acct-1" }]);
      dbQueue.push([
        {
          id: "lbl-1",
          userId: "default",
          name: "Food",
          color: "#ef4444",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([
        { postedAt: recentDate, amount: -50 }, // spend, within 1d
        { postedAt: recentDate, amount: 100 }, // income, within 1d
        { postedAt: threeDaysAgo, amount: -30 }, // spend, within 1w
        { postedAt: fifteenDaysAgo, amount: -200 }, // spend, within 1m
      ]);

      const { summaries, labels, error } = await getSpendingSummaries();
      expect(error).toBeUndefined();
      expect(labels).toHaveLength(1);
      expect(summaries).toHaveLength(4);

      const byPeriod = Object.fromEntries(summaries.map((s) => [s.period, s]));

      // 1d -> 2 txs: spend 50, income 100, net +50
      expect(byPeriod["1d"].spending).toBe(50);
      expect(byPeriod["1d"].income).toBe(100);
      expect(byPeriod["1d"].net).toBe(50);
      expect(byPeriod["1d"].transactionCount).toBe(2);

      // 1w -> 3 txs: spend 80, income 100, net +20
      expect(byPeriod["1w"].spending).toBe(80);
      expect(byPeriod["1w"].income).toBe(100);
      expect(byPeriod["1w"].net).toBe(20);
      expect(byPeriod["1w"].transactionCount).toBe(3);

      // 1m -> all 4: spend 280, income 100, net -180
      expect(byPeriod["1m"].spending).toBe(280);
      expect(byPeriod["1m"].income).toBe(100);
      expect(byPeriod["1m"].net).toBe(-180);
      expect(byPeriod["1m"].transactionCount).toBe(4);

      // 1y -> all 4 (same as 1m for this dataset)
      expect(byPeriod["1y"].spending).toBe(280);
      expect(byPeriod["1y"].income).toBe(100);
      expect(byPeriod["1y"].transactionCount).toBe(4);
    });

    it("handles no transactions (all zeroes)", async () => {
      dbQueue.push([{ id: "acct-1" }]); // accounts
      dbQueue.push([]); // labels
      dbQueue.push([]); // transactions

      const { summaries } = await getSpendingSummaries();
      expect(summaries).toHaveLength(4);
      for (const s of summaries) {
        expect(s.spending).toBe(0);
        expect(s.income).toBe(0);
        expect(s.net).toBe(0);
        expect(s.transactionCount).toBe(0);
      }
    });
  });

  // ---------------------------------------------------------------
  // getTransactionsForPeriod
  // ---------------------------------------------------------------
  describe("getTransactionsForPeriod", () => {
    beforeEach(authed);

    it("returns empty when user has no accounts", async () => {
      dbQueue.push([]); // accounts -> empty

      const r = await getTransactionsForPeriod(7);
      expect(r).toEqual({ transactions: [], topSpending: [], topIncome: [] });
    });

    it("returns transactions with account names and labels", async () => {
      // accounts -> labels -> txList
      dbQueue.push([{ id: "acct-1", name: "Checking" }]);
      dbQueue.push([
        {
          id: "lbl-1",
          userId: "default",
          name: "Food",
          color: "#ef4444",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([
        {
          id: "tx-1",
          accountId: "acct-1",
          externalId: "e1",
          postedAt: recentDate,
          amount: -25,
          description: "Grocery Store",
          payee: "Kroger",
          memo: null,
          pending: false,
          labelId: "lbl-1",
          createdAt: recentDate,
        },
        {
          id: "tx-2",
          accountId: "acct-1",
          externalId: "e2",
          postedAt: recentDate,
          amount: 500,
          description: "Payroll",
          payee: "Employer Inc",
          memo: null,
          pending: false,
          labelId: null,
          createdAt: recentDate,
        },
      ]);

      const { transactions, error } = await getTransactionsForPeriod(7);
      expect(error).toBeUndefined();
      expect(transactions).toHaveLength(2);

      // first tx gets account name + label attached
      expect(transactions[0].account_name).toBe("Checking");
      expect(transactions[0].label).toEqual(
        expect.objectContaining({ id: "lbl-1", name: "Food" })
      );

      // second tx has no label
      expect(transactions[1].account_name).toBe("Checking");
      expect(transactions[1].label).toBeNull();
    });

    it("calculates topSpending and topIncome correctly", async () => {
      dbQueue.push([{ id: "acct-1", name: "Checking" }]);
      dbQueue.push([]); // no labels
      const makeTx = (
        id: string,
        amount: number,
        payee: string,
        desc: string
      ) => ({
        id,
        accountId: "acct-1",
        externalId: id,
        postedAt: recentDate,
        amount,
        description: desc,
        payee,
        memo: null,
        pending: false,
        labelId: null,
        createdAt: recentDate,
      });

      dbQueue.push([
        makeTx("t1", -50, "Starbucks", "Coffee"),
        makeTx("t2", -30, "Starbucks", "Coffee"),
        makeTx("t3", -100, "Restaurant", "Dinner"),
        makeTx("t4", 2000, "Employer", "Salary"),
        makeTx("t5", 50, "Store", "Refund"),
      ]);

      const { topSpending, topIncome } = await getTransactionsForPeriod(7);

      // topSpending sorted desc by amount: Restaurant (100), Starbucks (80)
      expect(topSpending).toHaveLength(2);
      expect(topSpending[0]).toEqual(
        expect.objectContaining({ name: "Restaurant", amount: 100, count: 1 })
      );
      expect(topSpending[1]).toEqual(
        expect.objectContaining({ name: "Starbucks", amount: 80, count: 2 })
      );

      // topIncome sorted desc: Employer (2000), Store (50)
      expect(topIncome).toHaveLength(2);
      expect(topIncome[0]).toEqual(
        expect.objectContaining({ name: "Employer", amount: 2000 })
      );
      expect(topIncome[1]).toEqual(
        expect.objectContaining({ name: "Store", amount: 50 })
      );
    });

    it("uses description when payee is absent", async () => {
      dbQueue.push([{ id: "acct-1", name: "Savings" }]);
      dbQueue.push([]);
      dbQueue.push([
        {
          id: "tx-1",
          accountId: "acct-1",
          externalId: "e1",
          postedAt: recentDate,
          amount: -20,
          description: "ATM Withdrawal",
          payee: null,
          memo: null,
          pending: false,
          labelId: null,
          createdAt: recentDate,
        },
      ]);

      const { topSpending } = await getTransactionsForPeriod(30);
      expect(topSpending[0].name).toBe("ATM Withdrawal");
    });
  });

  // ---------------------------------------------------------------
  // getLabelsWithRules
  // ---------------------------------------------------------------
  describe("getLabelsWithRules", () => {
    beforeEach(authed);

    it("returns labels with associated rules", async () => {
      // labels -> rules
      dbQueue.push([
        { id: "lbl-1", userId: "default", name: "Food", color: "#ef4444", createdAt: recentDate },
        { id: "lbl-2", userId: "default", name: "Transport", color: "#3b82f6", createdAt: recentDate },
      ]);
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "payee",
          matchPattern: "Kroger",
          createdAt: recentDate,
        },
        {
          id: "r2",
          userId: "default",
          labelId: "lbl-1",
          matchField: "payee",
          matchPattern: "Walmart",
          createdAt: recentDate,
        },
      ]);

      const { labels, error } = await getLabelsWithRules();
      expect(error).toBeUndefined();
      expect(labels).toHaveLength(2);

      // Food has 2 rules
      expect(labels[0].rules).toHaveLength(2);
      expect(labels[0].rules[0].matchPattern).toBe("Kroger");
      expect(labels[0].rules[1].matchPattern).toBe("Walmart");

      // Transport has 0 rules
      expect(labels[1].rules).toEqual([]);
    });

    it("handles labels with no rules", async () => {
      dbQueue.push([
        { id: "lbl-1", userId: "default", name: "Misc", color: "#8b5cf6", createdAt: recentDate },
      ]);
      dbQueue.push([]); // no rules

      const { labels } = await getLabelsWithRules();
      expect(labels).toHaveLength(1);
      expect(labels[0].rules).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // createLabel
  // ---------------------------------------------------------------
  describe("createLabel", () => {
    beforeEach(authed);

    it("creates with specified color and returns the label", async () => {
      const created = {
        id: "mock-generated-id",
        userId: "default",
        name: "Food",
        color: "#22c55e",
        createdAt: recentDate,
      };
      dbQueue.push({ changes: 1 }); // insert().run()
      dbQueue.push(created); // select().get()

      const { label, error } = await createLabel("Food", "#22c55e");
      expect(error).toBeUndefined();
      expect(label).toEqual(created);
    });

    it("creates with a random color when none specified", async () => {
      dbQueue.push({ changes: 1 }); // insert
      dbQueue.push({
        id: "mock-generated-id",
        userId: "default",
        name: "Bills",
        color: "#ef4444",
        createdAt: recentDate,
      }); // select

      const { label, error } = await createLabel("Bills");
      expect(error).toBeUndefined();
      expect(label).toBeDefined();
      expect(label!.name).toBe("Bills");
    });
  });

  // ---------------------------------------------------------------
  // deleteLabel
  // ---------------------------------------------------------------
  describe("deleteLabel", () => {
    beforeEach(authed);

    it("deletes an owned label", async () => {
      dbQueue.push({ changes: 1 }); // delete().run()

      const r = await deleteLabel("lbl-1");
      expect(r).toEqual({ success: true });
    });

    it("returns error for non-existent label", async () => {
      dbQueue.push({ changes: 0 }); // nothing deleted

      const r = await deleteLabel("nonexistent");
      expect(r).toEqual({ success: false, error: "Label not found" });
    });
  });

  // ---------------------------------------------------------------
  // labelTransaction
  // ---------------------------------------------------------------
  describe("labelTransaction", () => {
    beforeEach(authed);

    it("labels a transaction successfully", async () => {
      // get transaction -> update tx
      dbQueue.push({
        id: "tx-1",
        accountId: "acct-1",
        payee: "Kroger",
        description: "Grocery",
      });
      dbQueue.push({ changes: 1 }); // update

      const r = await labelTransaction("tx-1", "lbl-1");
      expect(r).toEqual({ success: true });
    });

    it("returns error when transaction not found", async () => {
      dbQueue.push(undefined); // transaction .get() -> not found

      const r = await labelTransaction("ghost", "lbl-1");
      expect(r).toEqual({ success: false, error: "Transaction not found" });
    });

    it("creates a rule when createRule is true (payee present)", async () => {
      dbQueue.push({
        id: "tx-1",
        accountId: "acct-1",
        payee: "Kroger",
        description: "Grocery",
      });
      dbQueue.push({ changes: 1 }); // update transaction
      dbQueue.push({ changes: 1 }); // insert rule

      const r = await labelTransaction("tx-1", "lbl-1", true);
      expect(r).toEqual({ success: true });
    });

    it("does not create a rule when labelId is null", async () => {
      dbQueue.push({
        id: "tx-1",
        accountId: "acct-1",
        payee: "Kroger",
        description: "Grocery",
      });
      dbQueue.push({ changes: 1 }); // update tx (set labelId=null)
      // no insert-rule call expected

      const r = await labelTransaction("tx-1", null, true);
      expect(r).toEqual({ success: true });
    });
  });

  // ---------------------------------------------------------------
  // applyLabelRules
  // ---------------------------------------------------------------
  describe("applyLabelRules", () => {
    beforeEach(authed);

    it("returns 0 when no rules exist", async () => {
      dbQueue.push([]); // rules -> empty

      expect(await applyLabelRules()).toEqual({ applied: 0 });
    });

    it("returns 0 when no accounts exist", async () => {
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "payee",
          matchPattern: "Kroger",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([]); // accounts -> empty

      expect(await applyLabelRules()).toEqual({ applied: 0 });
    });

    it("skips already-labeled transactions (query filters them out)", async () => {
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "payee",
          matchPattern: "Kroger",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([{ id: "acct-1" }]);
      dbQueue.push([]); // no unlabeled transactions

      expect(await applyLabelRules()).toEqual({ applied: 0 });
    });

    it("matches by payee (case-insensitive)", async () => {
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "payee",
          matchPattern: "kroger",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([{ id: "acct-1" }]);
      dbQueue.push([
        {
          id: "tx-1",
          accountId: "acct-1",
          payee: "KROGER #1234",
          description: "Purchase",
          labelId: null,
        },
        {
          id: "tx-2",
          accountId: "acct-1",
          payee: "Walmart",
          description: "Shopping",
          labelId: null,
        },
      ]);
      dbQueue.push({ changes: 1 }); // update tx-1

      const r = await applyLabelRules();
      expect(r.applied).toBe(1);
    });

    it("matches by description", async () => {
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "description",
          matchPattern: "grocery",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([{ id: "acct-1" }]);
      dbQueue.push([
        {
          id: "tx-1",
          accountId: "acct-1",
          payee: "Store",
          description: "Weekly Grocery Run",
          labelId: null,
        },
      ]);
      dbQueue.push({ changes: 1 });

      expect((await applyLabelRules()).applied).toBe(1);
    });

    it("matches by both payee and description", async () => {
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "both",
          matchPattern: "coffee",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([{ id: "acct-1" }]);
      dbQueue.push([
        {
          id: "tx-1",
          accountId: "acct-1",
          payee: "Coffee Shop",
          description: "Purchase",
          labelId: null,
        },
        {
          id: "tx-2",
          accountId: "acct-1",
          payee: null,
          description: "Morning coffee",
          labelId: null,
        },
      ]);
      dbQueue.push({ changes: 1 }); // tx-1 via payee
      dbQueue.push({ changes: 1 }); // tx-2 via description

      expect((await applyLabelRules()).applied).toBe(2);
    });

    it("only applies first matching rule per transaction", async () => {
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "payee",
          matchPattern: "store",
          createdAt: recentDate,
        },
        {
          id: "r2",
          userId: "default",
          labelId: "lbl-2",
          matchField: "payee",
          matchPattern: "store",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([{ id: "acct-1" }]);
      dbQueue.push([
        {
          id: "tx-1",
          accountId: "acct-1",
          payee: "The Store",
          description: "Purchase",
          labelId: null,
        },
      ]);
      dbQueue.push({ changes: 1 }); // only one update (first rule wins)

      // Should be 1, not 2 - break after first match
      expect((await applyLabelRules()).applied).toBe(1);
    });

    it("does not match payee rule when payee is null", async () => {
      dbQueue.push([
        {
          id: "r1",
          userId: "default",
          labelId: "lbl-1",
          matchField: "payee",
          matchPattern: "test",
          createdAt: recentDate,
        },
      ]);
      dbQueue.push([{ id: "acct-1" }]);
      dbQueue.push([
        {
          id: "tx-1",
          accountId: "acct-1",
          payee: null,
          description: "test payment",
          labelId: null,
        },
      ]);
      // No update expected - payee rule doesn't match when payee is null

      expect((await applyLabelRules()).applied).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // createLabelRule
  // ---------------------------------------------------------------
  describe("createLabelRule", () => {
    beforeEach(authed);

    it("creates a rule with default matchField (description)", async () => {
      dbQueue.push({ changes: 1 }); // insert().run()

      const r = await createLabelRule("lbl-1", "grocery");
      expect(r).toEqual({ success: true });
    });

    it("creates a rule with payee matchField", async () => {
      dbQueue.push({ changes: 1 });

      const r = await createLabelRule("lbl-1", "Kroger", "payee");
      expect(r).toEqual({ success: true });
    });

    it("creates a rule with both matchField", async () => {
      dbQueue.push({ changes: 1 });

      const r = await createLabelRule("lbl-1", "coffee", "both");
      expect(r).toEqual({ success: true });
    });
  });

  // ---------------------------------------------------------------
  // deleteLabelRule
  // ---------------------------------------------------------------
  describe("deleteLabelRule", () => {
    beforeEach(authed);

    it("deletes an owned rule", async () => {
      dbQueue.push({ changes: 1 });

      expect(await deleteLabelRule("r1")).toEqual({ success: true });
    });

    it("returns error for non-existent rule", async () => {
      dbQueue.push({ changes: 0 });

      expect(await deleteLabelRule("ghost")).toEqual({
        success: false,
        error: "Rule not found",
      });
    });
  });
});
