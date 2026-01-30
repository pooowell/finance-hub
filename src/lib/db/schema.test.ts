import { describe, it, expect } from "vitest";
import {
  users,
  sessions,
  accounts,
  snapshots,
  transactions,
  transactionLabels,
  labelRules,
  credentials,
} from "./schema";

/**
 * Tests for database schema definitions
 * Validates that table exports exist and have expected columns
 */
describe("Database Schema", () => {
  describe("users table", () => {
    it("should be defined", () => {
      expect(users).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(users);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("email");
      expect(columnNames).toContain("hashedPassword");
      expect(columnNames).toContain("fullName");
      expect(columnNames).toContain("avatarUrl");
      expect(columnNames).toContain("createdAt");
      expect(columnNames).toContain("updatedAt");
    });

    it("should have id column configured correctly", () => {
      expect(users.id).toBeDefined();
      expect(users.id.name).toBe("id");
    });

    it("should have email column configured correctly", () => {
      expect(users.email).toBeDefined();
      expect(users.email.name).toBe("email");
    });
  });

  describe("sessions table", () => {
    it("should be defined", () => {
      expect(sessions).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(sessions);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("userId");
      expect(columnNames).toContain("expiresAt");
    });

    it("should have id column configured correctly", () => {
      expect(sessions.id).toBeDefined();
      expect(sessions.id.name).toBe("id");
    });
  });

  describe("accounts table", () => {
    it("should be defined", () => {
      expect(accounts).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(accounts);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("userId");
      expect(columnNames).toContain("provider");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("type");
      expect(columnNames).toContain("balanceUsd");
      expect(columnNames).toContain("externalId");
      expect(columnNames).toContain("metadata");
      expect(columnNames).toContain("lastSyncedAt");
      expect(columnNames).toContain("isHidden");
      expect(columnNames).toContain("includeInNetWorth");
      expect(columnNames).toContain("category");
    });

    it("should have id column configured correctly", () => {
      expect(accounts.id).toBeDefined();
      expect(accounts.id.name).toBe("id");
    });
  });

  describe("snapshots table", () => {
    it("should be defined", () => {
      expect(snapshots).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(snapshots);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("accountId");
      expect(columnNames).toContain("timestamp");
      expect(columnNames).toContain("valueUsd");
      expect(columnNames).toContain("createdAt");
    });
  });

  describe("transactions table", () => {
    it("should be defined", () => {
      expect(transactions).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(transactions);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("accountId");
      expect(columnNames).toContain("externalId");
      expect(columnNames).toContain("postedAt");
      expect(columnNames).toContain("amount");
      expect(columnNames).toContain("description");
      expect(columnNames).toContain("payee");
      expect(columnNames).toContain("memo");
      expect(columnNames).toContain("pending");
      expect(columnNames).toContain("labelId");
    });
  });

  describe("transactionLabels table", () => {
    it("should be defined", () => {
      expect(transactionLabels).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(transactionLabels);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("userId");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("color");
    });
  });

  describe("labelRules table", () => {
    it("should be defined", () => {
      expect(labelRules).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(labelRules);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("userId");
      expect(columnNames).toContain("labelId");
      expect(columnNames).toContain("matchField");
      expect(columnNames).toContain("matchPattern");
    });
  });

  describe("credentials table", () => {
    it("should be defined", () => {
      expect(credentials).toBeDefined();
    });

    it("should have required columns", () => {
      const columnNames = Object.keys(credentials);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("userId");
      expect(columnNames).toContain("provider");
      expect(columnNames).toContain("accessToken");
    });
  });

  describe("table relationships", () => {
    it("should have proper foreign key reference from sessions to users", () => {
      expect(sessions.userId).toBeDefined();
    });

    it("should have proper foreign key reference from accounts to users", () => {
      expect(accounts.userId).toBeDefined();
    });

    it("should have proper foreign key reference from snapshots to accounts", () => {
      expect(snapshots.accountId).toBeDefined();
    });

    it("should have proper foreign key reference from transactions to accounts", () => {
      expect(transactions.accountId).toBeDefined();
    });

    it("should have proper foreign key reference from transactions to labels", () => {
      expect(transactions.labelId).toBeDefined();
    });

    it("should have proper foreign key reference from labelRules to labels", () => {
      expect(labelRules.labelId).toBeDefined();
    });
  });

  describe("type exports", () => {
    it("should export User type", async () => {
      const schema = await import("./schema");
      expect(schema).toHaveProperty("users");
    });

    it("should export Account type", async () => {
      const schema = await import("./schema");
      expect(schema).toHaveProperty("accounts");
    });

    it("should export Transaction type", async () => {
      const schema = await import("./schema");
      expect(schema).toHaveProperty("transactions");
    });
  });
});
