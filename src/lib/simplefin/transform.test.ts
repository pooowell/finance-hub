import { describe, it, expect } from "vitest";
import {
  transformAccount,
  transformAccounts,
  createSnapshot,
  transformTransaction,
  transformTransactions,
} from "./transform";
import type { SimpleFINAccount, SimpleFINTransaction } from "@/types/simplefin";

describe("SimpleFIN Transform", () => {
  const mockUserId = "user-123";

  const mockSimpleFINAccount: SimpleFINAccount = {
    org: {
      domain: "chase.com",
      name: "Chase",
    },
    id: "account-456",
    name: "Checking Account",
    currency: "USD",
    balance: "1234.56",
    "balance-date": 1705593600,
  };

  describe("transformAccount", () => {
    it("should transform a SimpleFIN account to database format", () => {
      const result = transformAccount(mockSimpleFINAccount, mockUserId);

      expect(result.user_id).toBe(mockUserId);
      expect(result.provider).toBe("SimpleFIN");
      expect(result.name).toBe("Chase - Checking Account");
      expect(result.type).toBe("checking");
      expect(result.balance_usd).toBe(1234.56);
      expect(result.external_id).toBe("account-456");
      expect(result.last_synced_at).toBeDefined();
    });

    it("should correctly infer account type from name", () => {
      const savingsAccount: SimpleFINAccount = {
        ...mockSimpleFINAccount,
        org: { domain: "unknown-bank.com", name: "Unknown Bank" },
        name: "Savings Account",
      };
      const result = transformAccount(savingsAccount, mockUserId);
      expect(result.type).toBe("savings");
    });

    it("should correctly infer credit card type", () => {
      const creditAccount: SimpleFINAccount = {
        ...mockSimpleFINAccount,
        org: { domain: "unknown-bank.com", name: "Unknown Bank" },
        name: "Credit Card",
      };
      const result = transformAccount(creditAccount, mockUserId);
      expect(result.type).toBe("credit");
    });

    it("should correctly infer investment type", () => {
      const investmentAccount: SimpleFINAccount = {
        ...mockSimpleFINAccount,
        org: { domain: "schwab.com", name: "Schwab" },
        name: "Brokerage Account",
      };
      const result = transformAccount(investmentAccount, mockUserId);
      expect(result.type).toBe("investment");
    });

    it("should correctly infer crypto type", () => {
      const cryptoAccount: SimpleFINAccount = {
        ...mockSimpleFINAccount,
        org: { domain: "coinbase.com", name: "Coinbase" },
        name: "Bitcoin Wallet",
      };
      const result = transformAccount(cryptoAccount, mockUserId);
      expect(result.type).toBe("crypto");
    });

    it("should include metadata with org info", () => {
      const result = transformAccount(mockSimpleFINAccount, mockUserId);
      expect(result.metadata).toEqual({
        org_domain: "chase.com",
        org_name: "Chase",
        currency: "USD",
        available_balance: undefined,
      });
    });

    it("should include available balance in metadata when present", () => {
      const accountWithAvailable: SimpleFINAccount = {
        ...mockSimpleFINAccount,
        "available-balance": "1000.00",
      };
      const result = transformAccount(accountWithAvailable, mockUserId);
      expect(result.metadata).toHaveProperty("available_balance", "1000.00");
    });
  });

  describe("transformAccounts", () => {
    it("should transform multiple accounts", () => {
      const accounts: SimpleFINAccount[] = [
        mockSimpleFINAccount,
        {
          ...mockSimpleFINAccount,
          id: "account-789",
          name: "Savings Account",
          balance: "5000.00",
        },
      ];

      const result = transformAccounts(accounts, mockUserId);

      expect(result).toHaveLength(2);
      expect(result[0].external_id).toBe("account-456");
      expect(result[1].external_id).toBe("account-789");
    });

    it("should return empty array for empty input", () => {
      const result = transformAccounts([], mockUserId);
      expect(result).toEqual([]);
    });
  });

  describe("createSnapshot", () => {
    it("should create a snapshot with provided values", () => {
      const accountId = "account-123";
      const balance = 1500.5;

      const result = createSnapshot(accountId, balance);

      expect(result.account_id).toBe(accountId);
      expect(result.value_usd).toBe(balance);
      expect(result.timestamp).toBeDefined();
    });

    it("should use provided timestamp when given", () => {
      const accountId = "account-123";
      const balance = 1500.5;
      const timestamp = new Date("2024-01-15T10:00:00Z");

      const result = createSnapshot(accountId, balance, timestamp);

      expect(result.timestamp).toBe(timestamp.toISOString());
    });

    it("should use current time when timestamp not provided", () => {
      const before = new Date();
      const result = createSnapshot("account-123", 1000);
      const after = new Date();

      const resultTime = new Date(result.timestamp!).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before.getTime());
      expect(resultTime).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("transformTransaction", () => {
    const mockAccountId = "account-123";

    const mockSimpleFINTransaction: SimpleFINTransaction = {
      id: "txn-456",
      posted: 1705593600, // Unix timestamp
      amount: "-50.00",
      description: "Coffee Shop Purchase",
      payee: "Starbucks",
      memo: "Morning coffee",
      pending: false,
    };

    it("should transform a SimpleFIN transaction to database format", () => {
      const result = transformTransaction(mockSimpleFINTransaction, mockAccountId);

      expect(result.account_id).toBe(mockAccountId);
      expect(result.external_id).toBe("txn-456");
      expect(result.amount).toBe(-50.0);
      expect(result.description).toBe("Coffee Shop Purchase");
      expect(result.payee).toBe("Starbucks");
      expect(result.memo).toBe("Morning coffee");
      expect(result.pending).toBe(false);
    });

    it("should convert Unix timestamp to ISO string", () => {
      const result = transformTransaction(mockSimpleFINTransaction, mockAccountId);

      // 1705593600 = 2024-01-18T16:00:00.000Z
      expect(result.posted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      const parsedDate = new Date(result.posted_at);
      expect(parsedDate.getTime()).toBe(1705593600000);
    });

    it("should handle positive amounts (income)", () => {
      const incomeTransaction: SimpleFINTransaction = {
        ...mockSimpleFINTransaction,
        amount: "1500.00",
        description: "Salary Deposit",
      };
      const result = transformTransaction(incomeTransaction, mockAccountId);

      expect(result.amount).toBe(1500.0);
    });

    it("should handle missing payee", () => {
      const transactionNoPayee: SimpleFINTransaction = {
        id: "txn-789",
        posted: 1705593600,
        amount: "-25.00",
        description: "Some purchase",
      };
      const result = transformTransaction(transactionNoPayee, mockAccountId);

      expect(result.payee).toBeNull();
    });

    it("should handle missing memo", () => {
      const transactionNoMemo: SimpleFINTransaction = {
        id: "txn-789",
        posted: 1705593600,
        amount: "-25.00",
        description: "Some purchase",
        payee: "Some Store",
      };
      const result = transformTransaction(transactionNoMemo, mockAccountId);

      expect(result.memo).toBeNull();
    });

    it("should default pending to false when not provided", () => {
      const transactionNoPending: SimpleFINTransaction = {
        id: "txn-789",
        posted: 1705593600,
        amount: "-25.00",
        description: "Some purchase",
      };
      const result = transformTransaction(transactionNoPending, mockAccountId);

      expect(result.pending).toBe(false);
    });

    it("should handle pending transactions", () => {
      const pendingTransaction: SimpleFINTransaction = {
        ...mockSimpleFINTransaction,
        pending: true,
      };
      const result = transformTransaction(pendingTransaction, mockAccountId);

      expect(result.pending).toBe(true);
    });

    it("should handle decimal amounts with precision", () => {
      const preciseTransaction: SimpleFINTransaction = {
        ...mockSimpleFINTransaction,
        amount: "-123.45",
      };
      const result = transformTransaction(preciseTransaction, mockAccountId);

      expect(result.amount).toBe(-123.45);
    });

    it("should handle zero amounts", () => {
      const zeroTransaction: SimpleFINTransaction = {
        ...mockSimpleFINTransaction,
        amount: "0.00",
      };
      const result = transformTransaction(zeroTransaction, mockAccountId);

      expect(result.amount).toBe(0);
    });
  });

  describe("transformTransactions", () => {
    const mockAccountId = "account-123";

    it("should transform multiple transactions", () => {
      const transactions: SimpleFINTransaction[] = [
        {
          id: "txn-1",
          posted: 1705593600,
          amount: "-50.00",
          description: "Purchase 1",
        },
        {
          id: "txn-2",
          posted: 1705680000,
          amount: "1000.00",
          description: "Deposit",
        },
        {
          id: "txn-3",
          posted: 1705766400,
          amount: "-75.50",
          description: "Purchase 2",
        },
      ];

      const result = transformTransactions(transactions, mockAccountId);

      expect(result).toHaveLength(3);
      expect(result[0].external_id).toBe("txn-1");
      expect(result[1].external_id).toBe("txn-2");
      expect(result[2].external_id).toBe("txn-3");
      expect(result[0].amount).toBe(-50.0);
      expect(result[1].amount).toBe(1000.0);
      expect(result[2].amount).toBe(-75.5);
    });

    it("should return empty array for empty input", () => {
      const result = transformTransactions([], mockAccountId);
      expect(result).toEqual([]);
    });

    it("should preserve transaction order", () => {
      const transactions: SimpleFINTransaction[] = [
        { id: "first", posted: 1, amount: "1", description: "First" },
        { id: "second", posted: 2, amount: "2", description: "Second" },
        { id: "third", posted: 3, amount: "3", description: "Third" },
      ];

      const result = transformTransactions(transactions, mockAccountId);

      expect(result[0].external_id).toBe("first");
      expect(result[1].external_id).toBe("second");
      expect(result[2].external_id).toBe("third");
    });
  });
});
