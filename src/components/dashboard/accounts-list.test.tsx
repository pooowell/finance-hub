import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountsList } from "./accounts-list";
import type { Account } from "@/types/database";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acct-1",
    userId: "user-1",
    provider: "SimpleFIN",
    name: "Chase Checking",
    type: "checking",
    balanceUsd: 5000.0,
    externalId: "ext-1",
    metadata: "{}",
    lastSyncedAt: "2025-01-15T10:00:00Z",
    isHidden: false,
    includeInNetWorth: true,
    category: "checking",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("AccountsList", () => {
  describe("empty state", () => {
    it("shows empty state message when no accounts", () => {
      render(<AccountsList accounts={[]} />);
      expect(screen.getByText("No accounts connected")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Connect your financial accounts to start tracking your portfolio."
        )
      ).toBeInTheDocument();
    });
  });

  describe("account rendering", () => {
    it("renders account names", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Chase Checking" }),
        makeAccount({ id: "2", name: "Coinbase BTC" }),
      ];
      render(<AccountsList accounts={accounts} />);
      expect(screen.getByText("Chase Checking")).toBeInTheDocument();
      expect(screen.getByText("Coinbase BTC")).toBeInTheDocument();
    });

    it("renders formatted balances", () => {
      const accounts = [
        makeAccount({ id: "1", balanceUsd: 12345.67 }),
      ];
      render(<AccountsList accounts={accounts} />);
      expect(screen.getByText("$12,345.67")).toBeInTheDocument();
    });

    it('renders "N/A" for null balances', () => {
      const accounts = [makeAccount({ id: "1", balanceUsd: null })];
      render(<AccountsList accounts={accounts} />);
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });

    it("renders account type badges", () => {
      const accounts = [
        makeAccount({ id: "1", type: "checking" }),
        makeAccount({ id: "2", type: "crypto", name: "Phantom Wallet" }),
      ];
      render(<AccountsList accounts={accounts} />);
      expect(screen.getByText("checking")).toBeInTheDocument();
      expect(screen.getByText("crypto")).toBeInTheDocument();
    });

    it("renders provider labels", () => {
      const accounts = [
        makeAccount({ id: "1", provider: "SimpleFIN" }),
        makeAccount({ id: "2", provider: "Solana", name: "Phantom" }),
      ];
      render(<AccountsList accounts={accounts} />);
      expect(screen.getByText("SimpleFIN")).toBeInTheDocument();
      expect(screen.getByText("Solana")).toBeInTheDocument();
    });

    it("shows last synced date for accounts with sync data", () => {
      const accounts = [
        makeAccount({ id: "1", lastSyncedAt: "2025-01-15T10:00:00Z" }),
      ];
      render(<AccountsList accounts={accounts} />);
      expect(screen.getByText(/Synced/)).toBeInTheDocument();
    });

    it("does not show synced date when lastSyncedAt is null", () => {
      const accounts = [makeAccount({ id: "1", lastSyncedAt: null })];
      render(<AccountsList accounts={accounts} />);
      expect(screen.queryByText(/Synced/)).not.toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    it("sorts accounts by balance descending", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Low Balance", balanceUsd: 100 }),
        makeAccount({ id: "2", name: "High Balance", balanceUsd: 50000 }),
        makeAccount({ id: "3", name: "Mid Balance", balanceUsd: 5000 }),
      ];
      render(<AccountsList accounts={accounts} />);

      const accountNames = screen.getAllByText(/Balance/).map((el: HTMLElement) => el.textContent);
      expect(accountNames).toEqual(["High Balance", "Mid Balance", "Low Balance"]);
    });

    it("treats null balance as zero for sorting", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Null Account", balanceUsd: null }),
        makeAccount({ id: "2", name: "Positive Account", balanceUsd: 100 }),
      ];
      render(<AccountsList accounts={accounts} />);

      const names = screen
        .getAllByText(/Account/)
        .filter((el: HTMLElement) => el.closest("[class*='font-medium']"))
        .map((el: HTMLElement) => el.textContent);
      expect(names[0]).toBe("Positive Account");
    });
  });

  describe("header", () => {
    it("shows Connected Accounts header when accounts exist", () => {
      const accounts = [makeAccount()];
      render(<AccountsList accounts={accounts} />);
      expect(screen.getByText("Connected Accounts")).toBeInTheDocument();
    });
  });
});
