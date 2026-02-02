import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionsTab } from "./transactions-tab";
import type { TransactionLabel } from "@/types/database";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockLabels: TransactionLabel[] = [
  { id: "lbl-1", userId: "user-1", name: "Groceries", color: "#22c55e", createdAt: "2025-01-01T00:00:00Z" },
  { id: "lbl-2", userId: "user-1", name: "Subscriptions", color: "#3b82f6", createdAt: "2025-01-01T00:00:00Z" },
];

function makeSummary(period: string, label: string, overrides: Record<string, unknown> = {}) {
  return {
    period,
    label,
    spending: 500,
    income: 800,
    net: 300,
    transactionCount: 12,
    ...overrides,
  };
}

const mockSummaries = [
  makeSummary("1d", "24 Hours", { spending: 120, income: 50, net: -70, transactionCount: 4 }),
  makeSummary("1w", "7 Days", { spending: 350, income: 200, net: -150, transactionCount: 18 }),
  makeSummary("1m", "30 Days"),
  makeSummary("1y", "1 Year", { spending: 6000, income: 9000, net: 3000, transactionCount: 240 }),
];

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    accountId: "acct-1",
    externalId: "ext-1",
    postedAt: "2025-06-15T12:00:00Z",
    amount: -42.5,
    description: "WHOLE FOODS MARKET",
    payee: "Whole Foods",
    memo: null,
    pending: false,
    labelId: null,
    createdAt: "2025-06-15T12:00:00Z",
    account_name: "Chase Checking",
    label: null,
    ...overrides,
  };
}

const mockTransactions = [
  makeTx({ id: "tx-1", payee: "Whole Foods", amount: -42.5, description: "WHOLE FOODS MARKET" }),
  makeTx({ id: "tx-2", payee: "Netflix", amount: -15.99, description: "NETFLIX.COM", label: mockLabels[1] }),
  makeTx({ id: "tx-3", payee: "Acme Corp", amount: 3200, description: "PAYROLL ACME CORP", account_name: "Savings" }),
  makeTx({ id: "tx-4", payee: "Amazon", amount: -89.97, description: "AMAZON.COM" }),
];

const mockTopSpending = [
  { name: "Amazon", amount: 89.97, count: 1, label: null },
  { name: "Whole Foods", amount: 42.5, count: 1, label: null },
  { name: "Netflix", amount: 15.99, count: 1, label: mockLabels[1] },
];

const mockTopIncome = [
  { name: "Acme Corp", amount: 3200, count: 1, label: null },
];

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSpendingSummaries = vi.fn();
const mockGetTransactionsForPeriod = vi.fn();
const mockCreateLabel = vi.fn();
const mockLabelTransaction = vi.fn();
const mockApplyLabelRules = vi.fn();

vi.mock("@/app/actions/transactions", () => ({
  getSpendingSummaries: (...args: unknown[]) => mockGetSpendingSummaries(...args),
  getTransactionsForPeriod: (...args: unknown[]) => mockGetTransactionsForPeriod(...args),
  createLabel: (...args: unknown[]) => mockCreateLabel(...args),
  labelTransaction: (...args: unknown[]) => mockLabelTransaction(...args),
  applyLabelRules: (...args: unknown[]) => mockApplyLabelRules(...args),
}));

// lucide-react icons — simple stubs so they don't break renders
vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Comp = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
    Comp.displayName = name;
    return Comp;
  };
  return {
    ArrowRightLeft: stub("ArrowRightLeft"),
    ArrowUpRight: stub("ArrowUpRight"),
    ArrowDownLeft: stub("ArrowDownLeft"),
    TrendingDown: stub("TrendingDown"),
    TrendingUp: stub("TrendingUp"),
    Tag: stub("Tag"),
    Plus: stub("Plus"),
    X: stub("X"),
    Sparkles: stub("Sparkles"),
    ChevronLeft: stub("ChevronLeft"),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Populate mocks with sensible defaults that resolve immediately. */
function setupHappyPath() {
  mockGetSpendingSummaries.mockResolvedValue({
    summaries: mockSummaries,
    labels: mockLabels,
  });
  mockGetTransactionsForPeriod.mockResolvedValue({
    transactions: mockTransactions,
    topSpending: mockTopSpending,
    topIncome: mockTopIncome,
  });
  mockCreateLabel.mockResolvedValue({ id: "lbl-new", success: true });
  mockLabelTransaction.mockResolvedValue({ success: true });
  mockApplyLabelRules.mockResolvedValue({ applied: 3 });
}

/** Wait for the loading skeleton to disappear and real content to appear. */
async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TransactionsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
  });

  // -------------------------------------------------------------------------
  // Loading & initial render
  // -------------------------------------------------------------------------

  describe("loading state", () => {
    it("shows skeleton cards while data is loading", () => {
      // Make the server actions hang so loading state persists
      mockGetTransactionsForPeriod.mockReturnValue(new Promise(() => {}));
      render(<TransactionsTab />);

      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThanOrEqual(4);
    });

    it("transitions from loading to populated content", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("Transactions")).toBeInTheDocument();
      expect(screen.getByText(/transactions$/)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe("empty state", () => {
    it("shows empty message when there are no transactions at all", async () => {
      mockGetSpendingSummaries.mockResolvedValue({
        summaries: mockSummaries.map((s) => ({ ...s, transactionCount: 0 })),
        labels: [],
      });
      mockGetTransactionsForPeriod.mockResolvedValue({
        transactions: [],
        topSpending: [],
        topIncome: [],
      });

      render(<TransactionsTab />);

      await waitFor(() => {
        expect(screen.getByText("No transactions yet")).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Transactions will appear here after syncing/)
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Spending summary cards
  // -------------------------------------------------------------------------

  describe("spending summary cards", () => {
    it("renders all four period summary cards", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("24 Hours")).toBeInTheDocument();
      expect(screen.getByText("7 Days")).toBeInTheDocument();
      expect(screen.getByText("30 Days")).toBeInTheDocument();
      expect(screen.getByText("1 Year")).toBeInTheDocument();
    });

    it("displays spending and income amounts on summary cards", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // The default selected period is 1m — its card values
      expect(screen.getByText("$500.00")).toBeInTheDocument();
      expect(screen.getByText("$800.00")).toBeInTheDocument();
    });

    it("shows net value with correct sign", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // 1m summary has net +300
      expect(screen.getByText("+$300.00")).toBeInTheDocument();
      // 1w summary has net -150
      expect(screen.getByText("-$150.00")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Time period switching
  // -------------------------------------------------------------------------

  describe("time period switching", () => {
    it("fetches transactions for 30 days on initial load (default period = 1m)", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(mockGetTransactionsForPeriod).toHaveBeenCalledWith(30);
    });

    it("fetches new transactions when clicking a different period card", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      // Click the "24 Hours" card
      await user.click(screen.getByText("24 Hours"));

      await waitFor(() => {
        expect(mockGetTransactionsForPeriod).toHaveBeenCalledWith(1);
      });
    });

    it("fetches 7-day transactions when clicking 7 Days card", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("7 Days"));

      await waitFor(() => {
        expect(mockGetTransactionsForPeriod).toHaveBeenCalledWith(7);
      });
    });

    it("fetches 365-day transactions when clicking 1 Year card", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("1 Year"));

      await waitFor(() => {
        expect(mockGetTransactionsForPeriod).toHaveBeenCalledWith(365);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Transaction list rendering
  // -------------------------------------------------------------------------

  describe("transaction list", () => {
    it("renders all transaction payees", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // Some payees appear in both the transaction list and top spending/income lists
      expect(screen.getAllByText("Whole Foods").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Netflix").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Acme Corp").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Amazon").length).toBeGreaterThanOrEqual(1);
    });

    it("shows the transaction count", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("4 transactions")).toBeInTheDocument();
    });

    it("renders the period label in the transactions header", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("Transactions - 30 Days")).toBeInTheDocument();
    });

    it("renders account name and formatted date", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // tx-1 is Chase Checking, Jun 15, 2025
      expect(screen.getAllByText(/Chase Checking/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Jun 15, 2025/).length).toBeGreaterThan(0);
    });

    it("formats debit amounts without a plus sign", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // -42.5 should show as -$42.50
      expect(screen.getByText("-$42.50")).toBeInTheDocument();
    });

    it("formats credit amounts with a plus sign", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // +3200 should show as +$3,200.00
      expect(screen.getByText("+$3,200.00")).toBeInTheDocument();
    });

    it("shows existing label badges on labeled transactions", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // Netflix transaction has the "Subscriptions" label
      expect(screen.getAllByText("Subscriptions").length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Top spending / income breakdown
  // -------------------------------------------------------------------------

  describe("top spending and income lists", () => {
    it("renders top spending list with names and amounts", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("Top Spending")).toBeInTheDocument();
      expect(screen.getByText("$89.97")).toBeInTheDocument(); // Amazon
    });

    it("renders top income list", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("Top Income")).toBeInTheDocument();
    });

    it("shows transaction count on top items", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      // Each top spender has count: 1 → shown as "1x"
      const countBadges = screen.getAllByText("1x");
      expect(countBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // View mode toggling
  // -------------------------------------------------------------------------

  describe("view mode toggling", () => {
    it("switches to spending view when clicking Top Spending list", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("Top Spending"));

      await waitFor(() => {
        expect(screen.getByText(/Top Spending - 30 Days/)).toBeInTheDocument();
      });
      expect(screen.getByText("Spending Transactions")).toBeInTheDocument();
    });

    it("switches to income view when clicking Top Income list", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("Top Income"));

      await waitFor(() => {
        expect(screen.getByText(/Top Income - 30 Days/)).toBeInTheDocument();
      });
      expect(screen.getByText("Income Transactions")).toBeInTheDocument();
    });

    it("filters to only spending transactions in spending view", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("Top Spending"));

      await waitFor(() => {
        expect(screen.getByText("Spending Transactions")).toBeInTheDocument();
      });

      // Credit transaction (Acme Corp +3200) should NOT appear
      expect(screen.queryByText("+$3,200.00")).not.toBeInTheDocument();
      // Debit transactions should appear
      expect(screen.getByText("-$42.50")).toBeInTheDocument();
    });

    it("filters to only income transactions in income view", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("Top Income"));

      await waitFor(() => {
        expect(screen.getByText("Income Transactions")).toBeInTheDocument();
      });

      // Income transaction should appear
      expect(screen.getByText("+$3,200.00")).toBeInTheDocument();
      // Debit transactions should NOT appear
      expect(screen.queryByText("-$42.50")).not.toBeInTheDocument();
    });

    it("shows Back button and returns to overview when clicked", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      // Enter spending view
      await user.click(screen.getByText("Top Spending"));
      await waitFor(() => {
        expect(screen.getByText("Back")).toBeInTheDocument();
      });

      // Click back
      await user.click(screen.getByText("Back"));

      await waitFor(() => {
        expect(screen.getByText("Transactions")).toBeInTheDocument();
      });
      // Summary cards should reappear
      expect(screen.getByText("24 Hours")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Label management
  // -------------------------------------------------------------------------

  describe("labels bar", () => {
    it("renders existing labels in the labels bar", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("Labels:")).toBeInTheDocument();
      expect(screen.getAllByText("Groceries").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Subscriptions").length).toBeGreaterThanOrEqual(1);
    });

    it("does not show labels bar when there are no labels", async () => {
      mockGetSpendingSummaries.mockResolvedValue({
        summaries: mockSummaries,
        labels: [],
      });

      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.queryByText("Labels:")).not.toBeInTheDocument();
    });
  });

  describe("label creation", () => {
    it("shows new label input when clicking New Label button", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("New Label"));

      expect(screen.getByPlaceholderText("Label name...")).toBeInTheDocument();
      expect(screen.getByText("Add")).toBeInTheDocument();
    });

    it("calls createLabel with the entered name and refreshes data", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("New Label"));
      await user.type(screen.getByPlaceholderText("Label name..."), "Dining");
      await user.click(screen.getByText("Add"));

      await waitFor(() => {
        expect(mockCreateLabel).toHaveBeenCalledWith("Dining");
      });
    });

    it("calls createLabel when pressing Enter in the input", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("New Label"));
      await user.type(screen.getByPlaceholderText("Label name..."), "Dining{Enter}");

      await waitFor(() => {
        expect(mockCreateLabel).toHaveBeenCalledWith("Dining");
      });
    });

    it("does not call createLabel for empty input", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("New Label"));
      await user.click(screen.getByText("Add"));

      expect(mockCreateLabel).not.toHaveBeenCalled();
    });

    it("hides the input when clicking the close button", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("New Label"));
      expect(screen.getByPlaceholderText("Label name...")).toBeInTheDocument();

      // The close button has an X icon — find the button near the input
      const closeButtons = screen.getAllByRole("button");
      const cancelBtn = closeButtons.find(
        (btn) => btn.querySelector('[data-testid="icon-X"]') && btn.textContent === ""
      );
      expect(cancelBtn).toBeTruthy();
      await user.click(cancelBtn!);

      expect(screen.queryByPlaceholderText("Label name...")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Auto-label
  // -------------------------------------------------------------------------

  describe("auto-label", () => {
    it("renders the Auto-label button", async () => {
      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("Auto-label")).toBeInTheDocument();
    });

    it("calls applyLabelRules when clicking Auto-label", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      await user.click(screen.getByText("Auto-label"));

      await waitFor(() => {
        expect(mockApplyLabelRules).toHaveBeenCalledOnce();
      });
    });

    it("disables Auto-label button when there are no labels", async () => {
      mockGetSpendingSummaries.mockResolvedValue({
        summaries: mockSummaries,
        labels: [],
      });

      render(<TransactionsTab />);
      await waitForLoaded();

      const btn = screen.getByText("Auto-label").closest("button");
      expect(btn).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Label application to transactions
  // -------------------------------------------------------------------------

  describe("labeling transactions", () => {
    it("shows label menu when hovering and clicking the tag button", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      // Find tag buttons (they have title "Add label")
      const tagButtons = screen.getAllByTitle("Add label");
      expect(tagButtons.length).toBeGreaterThan(0);

      await user.click(tagButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Select label")).toBeInTheDocument();
      });
    });

    it("calls labelTransaction when selecting a label from the menu", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      const tagButtons = screen.getAllByTitle("Add label");
      await user.click(tagButtons[0]); // Open menu on first transaction

      await waitFor(() => {
        expect(screen.getByText("Select label")).toBeInTheDocument();
      });

      // The label menu shows label names — click "Groceries"
      const menuLabels = screen.getByText("Select label").parentElement!;
      const groceriesBtn = within(menuLabels).getByText("Groceries");
      await user.click(groceriesBtn);

      await waitFor(() => {
        expect(mockLabelTransaction).toHaveBeenCalledWith("tx-1", "lbl-1", true);
      });
    });

    it("shows Remove label option for already-labeled transactions", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      // tx-2 (Netflix) has a label — find its tag button (second tag button)
      const tagButtons = screen.getAllByTitle("Add label");
      // Netflix is the second transaction
      await user.click(tagButtons[1]);

      await waitFor(() => {
        expect(screen.getByText("Remove label")).toBeInTheDocument();
      });
    });

    it("calls labelTransaction with null when removing a label", async () => {
      const user = userEvent.setup();
      render(<TransactionsTab />);
      await waitForLoaded();

      const tagButtons = screen.getAllByTitle("Add label");
      await user.click(tagButtons[1]); // Netflix (has label)

      await waitFor(() => {
        expect(screen.getByText("Remove label")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Remove label"));

      await waitFor(() => {
        expect(mockLabelTransaction).toHaveBeenCalledWith("tx-2", null, false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("renders without crashing when getSpendingSummaries rejects", async () => {
      mockGetSpendingSummaries.mockRejectedValue(new Error("Network error"));

      render(<TransactionsTab />);

      // Should still finish loading (fallback to empty state)
      await waitFor(() => {
        // The component catches the error and continues — transactions still load
        expect(mockGetTransactionsForPeriod).toHaveBeenCalled();
      });
    });

    it("renders without crashing when getTransactionsForPeriod rejects", async () => {
      mockGetTransactionsForPeriod.mockRejectedValue(new Error("DB error"));
      // summaries return but with 0 transactions to trigger empty state
      mockGetSpendingSummaries.mockResolvedValue({
        summaries: mockSummaries.map((s) => ({ ...s, transactionCount: 0 })),
        labels: [],
      });

      render(<TransactionsTab />);

      // Should finish loading without throwing
      await waitFor(() => {
        // Component catches the error and sets isLoading=false
        expect(screen.getByText("No transactions yet")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Top list empty state
  // -------------------------------------------------------------------------

  describe("top list empty states", () => {
    it("shows 'No spending in this period' when topSpending is empty", async () => {
      mockGetTransactionsForPeriod.mockResolvedValue({
        transactions: [makeTx({ id: "tx-income", amount: 1000, payee: "Employer" })],
        topSpending: [],
        topIncome: [{ name: "Employer", amount: 1000, count: 1, label: null }],
      });

      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("No spending in this period")).toBeInTheDocument();
    });

    it("shows 'No income in this period' when topIncome is empty", async () => {
      mockGetTransactionsForPeriod.mockResolvedValue({
        transactions: [makeTx({ id: "tx-spend", amount: -50, payee: "Store" })],
        topSpending: [{ name: "Store", amount: 50, count: 1, label: null }],
        topIncome: [],
      });

      render(<TransactionsTab />);
      await waitForLoaded();

      expect(screen.getByText("No income in this period")).toBeInTheDocument();
    });
  });
});
