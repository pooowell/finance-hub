import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountsTab } from "./accounts-tab";
import type { Account } from "@/types/database";

// Mock the server action
vi.mock("@/app/actions/accounts", () => ({
  updateAccount: vi.fn(() => Promise.resolve()),
}));

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

const defaultProps = {
  accounts: [] as Account[],
  showHidden: false,
  onShowHiddenChange: vi.fn(),
  onAccountUpdate: vi.fn(),
};

describe("AccountsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty state", () => {
    it("shows empty state when no accounts", () => {
      render(<AccountsTab {...defaultProps} accounts={[]} />);
      expect(screen.getByText("No accounts connected")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Connect your financial accounts to start tracking your portfolio."
        )
      ).toBeInTheDocument();
    });

    it("does not show the hidden accounts toggle when empty", () => {
      render(<AccountsTab {...defaultProps} accounts={[]} />);
      expect(screen.queryByText(/Show hidden accounts/)).not.toBeInTheDocument();
    });
  });

  describe("account rendering", () => {
    it("renders account names and providers", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Chase Checking", provider: "SimpleFIN" }),
        makeAccount({ id: "2", name: "Phantom Wallet", provider: "Solana" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByText("Chase Checking")).toBeInTheDocument();
      expect(screen.getByText("Phantom Wallet")).toBeInTheDocument();
      expect(screen.getByText("SimpleFIN")).toBeInTheDocument();
      expect(screen.getByText("Solana")).toBeInTheDocument();
    });

    it("renders formatted balances", () => {
      const accounts = [
        makeAccount({ id: "1", balanceUsd: 12345.67, category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByText("$12,345.67")).toBeInTheDocument();
    });

    it('renders "N/A" for null balances', () => {
      const accounts = [
        makeAccount({ id: "1", balanceUsd: null, category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });

    it("formats zero balance as $0.00", () => {
      const accounts = [
        makeAccount({ id: "1", balanceUsd: 0, category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByText("$0.00")).toBeInTheDocument();
    });

    it("formats negative balance correctly", () => {
      const accounts = [
        makeAccount({ id: "1", balanceUsd: -1500.5, category: "credit_cards" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByText("-$1,500.50")).toBeInTheDocument();
    });
  });

  describe("grouped by category", () => {
    it("groups accounts under their category headers", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Chase Checking", category: "checking" }),
        makeAccount({ id: "2", name: "Ally Savings", category: "savings" }),
        makeAccount({ id: "3", name: "Roth IRA", category: "retirement" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      // Category headers are h3 headings — use getByRole to avoid matching dropdown options
      const headings = screen.getAllByRole("heading", { level: 3 });
      const headingTexts = headings.map((h) => h.textContent);
      expect(headingTexts).toContain("Checking");
      expect(headingTexts).toContain("Savings");
      expect(headingTexts).toContain("Retirement");
    });

    it("shows Uncategorized group for accounts with null category", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Mystery Account", category: null }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      const headings = screen.getAllByRole("heading", { level: 3 });
      expect(headings.map((h) => h.textContent)).toContain("Uncategorized");
      expect(screen.getByText("Mystery Account")).toBeInTheDocument();
    });

    it("only renders category groups that have accounts", () => {
      const accounts = [
        makeAccount({ id: "1", category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      const headings = screen.getAllByRole("heading", { level: 3 });
      const headingTexts = headings.map((h) => h.textContent);
      expect(headingTexts).toContain("Checking");
      expect(headingTexts).not.toContain("Savings");
      expect(headingTexts).not.toContain("Retirement");
      expect(headingTexts).not.toContain("Assets");
      expect(headingTexts).not.toContain("Crypto");
    });

    it("renders multiple accounts within the same category group", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Chase Checking", category: "checking" }),
        makeAccount({ id: "2", name: "BoA Checking", category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      const headings = screen.getAllByRole("heading", { level: 3 });
      const checkingHeaders = headings.filter((h) => h.textContent === "Checking");
      expect(checkingHeaders).toHaveLength(1);
      expect(screen.getByText("Chase Checking")).toBeInTheDocument();
      expect(screen.getByText("BoA Checking")).toBeInTheDocument();
    });
  });

  describe("show/hide hidden accounts toggle", () => {
    it("does not show toggle when no accounts are hidden", () => {
      const accounts = [
        makeAccount({ id: "1", isHidden: false }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.queryByText(/Show hidden accounts/)).not.toBeInTheDocument();
    });

    it("shows toggle with hidden count when some accounts are hidden", () => {
      const accounts = [
        makeAccount({ id: "1", isHidden: false }),
        makeAccount({ id: "2", isHidden: true, category: "savings" }),
        makeAccount({ id: "3", isHidden: true, category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByText("Show hidden accounts (2)")).toBeInTheDocument();
    });

    it("calls onShowHiddenChange when checkbox is toggled", async () => {
      const user = userEvent.setup();
      const onShowHiddenChange = vi.fn();
      const accounts = [
        makeAccount({ id: "1", isHidden: true }),
      ];
      render(
        <AccountsTab
          {...defaultProps}
          accounts={accounts}
          onShowHiddenChange={onShowHiddenChange}
        />
      );

      await user.click(screen.getByRole("checkbox"));
      expect(onShowHiddenChange).toHaveBeenCalledWith(true);
    });

    it("hides hidden accounts when showHidden is false", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Visible Account", isHidden: false, category: "checking" }),
        makeAccount({ id: "2", name: "Hidden Account", isHidden: true, category: "savings" }),
      ];
      render(
        <AccountsTab {...defaultProps} accounts={accounts} showHidden={false} />
      );

      expect(screen.getByText("Visible Account")).toBeInTheDocument();
      expect(screen.queryByText("Hidden Account")).not.toBeInTheDocument();
    });

    it("shows hidden accounts when showHidden is true", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Visible Account", isHidden: false, category: "checking" }),
        makeAccount({ id: "2", name: "Hidden Account", isHidden: true, category: "savings" }),
      ];
      render(
        <AccountsTab {...defaultProps} accounts={accounts} showHidden={true} />
      );

      expect(screen.getByText("Visible Account")).toBeInTheDocument();
      expect(screen.getByText("Hidden Account")).toBeInTheDocument();
    });

    it("reflects checkbox state matching showHidden prop", () => {
      const accounts = [
        makeAccount({ id: "1", isHidden: true }),
      ];

      const { rerender } = render(
        <AccountsTab {...defaultProps} accounts={accounts} showHidden={false} />
      );
      expect(screen.getByRole("checkbox")).not.toBeChecked();

      rerender(
        <AccountsTab {...defaultProps} accounts={accounts} showHidden={true} />
      );
      expect(screen.getByRole("checkbox")).toBeChecked();
    });
  });

  describe("category dropdown", () => {
    it("renders a dropdown for each account with current category selected", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Chase", category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      const dropdown = screen.getByRole("combobox") as HTMLSelectElement;
      expect(dropdown.value).toBe("checking");
    });

    it("renders all category options in the dropdown", () => {
      const accounts = [
        makeAccount({ id: "1", category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      const dropdown = screen.getByRole("combobox");
      const options = within(dropdown).getAllByRole("option");
      expect(options).toHaveLength(7);
      expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
        "",
        "checking",
        "savings",
        "credit_cards",
        "retirement",
        "assets",
        "crypto",
      ]);
    });

    it("shows empty value for uncategorized accounts", () => {
      const accounts = [
        makeAccount({ id: "1", category: null }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      const dropdown = screen.getByRole("combobox") as HTMLSelectElement;
      expect(dropdown.value).toBe("");
    });

    it("calls updateAccount when category is changed", async () => {
      const { updateAccount } = await import("@/app/actions/accounts");
      const user = userEvent.setup();
      const onAccountUpdate = vi.fn();
      const accounts = [
        makeAccount({ id: "acct-1", category: "checking" }),
      ];
      render(
        <AccountsTab
          {...defaultProps}
          accounts={accounts}
          onAccountUpdate={onAccountUpdate}
        />
      );

      await user.selectOptions(screen.getByRole("combobox"), "savings");
      expect(updateAccount).toHaveBeenCalledWith("acct-1", {
        category: "savings",
      });
    });

    it("passes null for category when Uncategorized is selected", async () => {
      const { updateAccount } = await import("@/app/actions/accounts");
      const user = userEvent.setup();
      const accounts = [
        makeAccount({ id: "acct-1", category: "checking" }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      await user.selectOptions(screen.getByRole("combobox"), "");
      expect(updateAccount).toHaveBeenCalledWith("acct-1", {
        category: null,
      });
    });
  });

  describe("net worth toggle", () => {
    it("renders net worth toggle button for each account", () => {
      const accounts = [
        makeAccount({ id: "1", includeInNetWorth: true }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      expect(
        screen.getByTitle("Included in net worth")
      ).toBeInTheDocument();
    });

    it("shows 'Included in net worth' title when includeInNetWorth is true", () => {
      const accounts = [
        makeAccount({ id: "1", includeInNetWorth: true }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByTitle("Included in net worth")).toBeInTheDocument();
    });

    it("shows 'Excluded from net worth' title when includeInNetWorth is false", () => {
      const accounts = [
        makeAccount({ id: "1", includeInNetWorth: false }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByTitle("Excluded from net worth")).toBeInTheDocument();
    });

    it("calls updateAccount to toggle net worth inclusion", async () => {
      const { updateAccount } = await import("@/app/actions/accounts");
      const user = userEvent.setup();
      const accounts = [
        makeAccount({ id: "acct-1", includeInNetWorth: true }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      await user.click(screen.getByTitle("Included in net worth"));
      expect(updateAccount).toHaveBeenCalledWith("acct-1", {
        include_in_net_worth: false,
      });
    });

    it("calls updateAccount to include in net worth when currently excluded", async () => {
      const { updateAccount } = await import("@/app/actions/accounts");
      const user = userEvent.setup();
      const accounts = [
        makeAccount({ id: "acct-1", includeInNetWorth: false }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      await user.click(screen.getByTitle("Excluded from net worth"));
      expect(updateAccount).toHaveBeenCalledWith("acct-1", {
        include_in_net_worth: true,
      });
    });
  });

  describe("hide/show account toggle", () => {
    it("shows 'Hide account' title for visible accounts", () => {
      const accounts = [
        makeAccount({ id: "1", isHidden: false }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);
      expect(screen.getByTitle("Hide account")).toBeInTheDocument();
    });

    it("shows 'Show account' title for hidden accounts", () => {
      const accounts = [
        makeAccount({ id: "1", isHidden: true }),
      ];
      render(
        <AccountsTab {...defaultProps} accounts={accounts} showHidden={true} />
      );
      expect(screen.getByTitle("Show account")).toBeInTheDocument();
    });

    it("calls updateAccount to hide a visible account", async () => {
      const { updateAccount } = await import("@/app/actions/accounts");
      const user = userEvent.setup();
      const accounts = [
        makeAccount({ id: "acct-1", isHidden: false }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      await user.click(screen.getByTitle("Hide account"));
      expect(updateAccount).toHaveBeenCalledWith("acct-1", {
        is_hidden: true,
      });
    });

    it("calls updateAccount to show a hidden account", async () => {
      const { updateAccount } = await import("@/app/actions/accounts");
      const user = userEvent.setup();
      const accounts = [
        makeAccount({ id: "acct-1", isHidden: true }),
      ];
      render(
        <AccountsTab
          {...defaultProps}
          accounts={accounts}
          showHidden={true}
        />
      );

      await user.click(screen.getByTitle("Show account"));
      expect(updateAccount).toHaveBeenCalledWith("acct-1", {
        is_hidden: false,
      });
    });
  });

  describe("multiple accounts with interactions", () => {
    it("renders all category groups and accounts correctly", () => {
      const accounts = [
        makeAccount({ id: "1", name: "Chase Checking", category: "checking", balanceUsd: 5000 }),
        makeAccount({ id: "2", name: "Ally Savings", category: "savings", balanceUsd: 20000 }),
        makeAccount({ id: "3", name: "Amex Gold", category: "credit_cards", balanceUsd: -2500 }),
        makeAccount({ id: "4", name: "Phantom SOL", category: "crypto", provider: "Solana", balanceUsd: 8000 }),
        makeAccount({ id: "5", name: "Loose Account", category: null, balanceUsd: 100 }),
      ];
      render(<AccountsTab {...defaultProps} accounts={accounts} />);

      // All category headers present (use heading role to avoid matching dropdown options)
      const headings = screen.getAllByRole("heading", { level: 3 });
      const headingTexts = headings.map((h) => h.textContent);
      expect(headingTexts).toContain("Checking");
      expect(headingTexts).toContain("Savings");
      expect(headingTexts).toContain("Credit Cards");
      expect(headingTexts).toContain("Crypto");
      expect(headingTexts).toContain("Uncategorized");

      // All accounts present
      expect(screen.getByText("Chase Checking")).toBeInTheDocument();
      expect(screen.getByText("Ally Savings")).toBeInTheDocument();
      expect(screen.getByText("Amex Gold")).toBeInTheDocument();
      expect(screen.getByText("Phantom SOL")).toBeInTheDocument();
      expect(screen.getByText("Loose Account")).toBeInTheDocument();

      // Balances formatted
      expect(screen.getByText("$5,000.00")).toBeInTheDocument();
      expect(screen.getByText("$20,000.00")).toBeInTheDocument();
      expect(screen.getByText("-$2,500.00")).toBeInTheDocument();
      expect(screen.getByText("$8,000.00")).toBeInTheDocument();
      expect(screen.getByText("$100.00")).toBeInTheDocument();
    });
  });
});
