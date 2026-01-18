import { describe, it, expect } from "vitest";
import { transformAccount, transformAccounts, createSnapshot } from "./transform";
import type { SimpleFINAccount } from "@/types/simplefin";

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
});
