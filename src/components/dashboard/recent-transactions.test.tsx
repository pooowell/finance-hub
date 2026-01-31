import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RecentTransactions } from "./recent-transactions";
import type { TransactionWithAccount } from "@/app/actions/accounts";

// Mock the server action
vi.mock("@/app/actions/accounts", () => ({
  getRecentTransactions: vi.fn(),
}));

import { getRecentTransactions } from "@/app/actions/accounts";

const mockGetRecentTransactions = vi.mocked(getRecentTransactions);

function makeTx(overrides: Partial<TransactionWithAccount> = {}): TransactionWithAccount {
  return {
    id: "tx-1",
    accountId: "acct-1",
    externalId: "ext-tx-1",
    postedAt: "2025-01-15T10:00:00Z",
    amount: -42.5,
    description: "Coffee Shop",
    payee: "Starbucks",
    memo: null,
    pending: false,
    labelId: null,
    createdAt: "2025-01-15T10:00:00Z",
    account_name: "Chase Checking",
    ...overrides,
  };
}

describe("RecentTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeletons initially", () => {
    // Never resolve so we stay in loading state
    mockGetRecentTransactions.mockReturnValue(new Promise(() => {}));
    render(<RecentTransactions />);
    expect(screen.getByText("Recent Transactions")).toBeInTheDocument();
  });

  it("renders empty state when there are no transactions", async () => {
    mockGetRecentTransactions.mockResolvedValue({ transactions: [] });
    render(<RecentTransactions />);

    await waitFor(() => {
      expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Transactions will appear here after syncing your bank accounts."
      )
    ).toBeInTheDocument();
  });

  it("renders transactions with payee, account name and formatted amount", async () => {
    const transactions = [
      makeTx({
        id: "tx-1",
        payee: "Starbucks",
        amount: -42.5,
        account_name: "Chase Checking",
        postedAt: "2025-01-15T10:00:00Z",
      }),
      makeTx({
        id: "tx-2",
        payee: "Employer Inc",
        amount: 3500.0,
        account_name: "Chase Checking",
        postedAt: "2025-01-14T10:00:00Z",
      }),
    ];
    mockGetRecentTransactions.mockResolvedValue({ transactions });
    render(<RecentTransactions />);

    await waitFor(() => {
      expect(screen.getByText("Starbucks")).toBeInTheDocument();
    });
    expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    expect(screen.getByText("-$42.50")).toBeInTheDocument();
    expect(screen.getByText("+$3,500.00")).toBeInTheDocument();
  });

  it("uses description as fallback when payee is null", async () => {
    const transactions = [
      makeTx({ id: "tx-1", payee: null, description: "Direct Debit" }),
    ];
    mockGetRecentTransactions.mockResolvedValue({ transactions });
    render(<RecentTransactions />);

    await waitFor(() => {
      expect(screen.getByText("Direct Debit")).toBeInTheDocument();
    });
  });

  it("shows account name and formatted date for each transaction", async () => {
    const transactions = [
      makeTx({
        id: "tx-1",
        account_name: "Savings Account",
        postedAt: "2025-06-15T10:00:00Z",
      }),
    ];
    mockGetRecentTransactions.mockResolvedValue({ transactions });
    render(<RecentTransactions />);

    await waitFor(() => {
      expect(screen.getByText(/Savings Account/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Jun 15/)).toBeInTheDocument();
  });

  it("styles credit (positive) amounts in green", async () => {
    const transactions = [
      makeTx({ id: "tx-1", amount: 100.0 }),
    ];
    mockGetRecentTransactions.mockResolvedValue({ transactions });
    render(<RecentTransactions />);

    await waitFor(() => {
      const amount = screen.getByText("+$100.00");
      expect(amount.className).toContain("text-green-500");
    });
  });

  it("calls getRecentTransactions with limit 10", async () => {
    mockGetRecentTransactions.mockResolvedValue({ transactions: [] });
    render(<RecentTransactions />);

    await waitFor(() => {
      expect(mockGetRecentTransactions).toHaveBeenCalledWith(10);
    });
  });
});
