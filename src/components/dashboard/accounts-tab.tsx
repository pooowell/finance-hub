"use client";

import { useTransition } from "react";
import { Wallet, Building2, Eye, EyeOff, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateAccount } from "@/app/actions/accounts";
import type { Database, AccountCategory } from "@/types/database";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

interface AccountsTabProps {
  accounts: Account[];
  showHidden: boolean;
  onShowHiddenChange: (show: boolean) => void;
  onAccountUpdate: () => void;
}

const CATEGORIES: { id: AccountCategory | null; label: string }[] = [
  { id: "checking", label: "Checking" },
  { id: "savings", label: "Savings" },
  { id: "credit_cards", label: "Credit Cards" },
  { id: "retirement", label: "Retirement" },
  { id: "assets", label: "Assets" },
  { id: "crypto", label: "Crypto" },
  { id: null, label: "Uncategorized" },
];

const CATEGORY_OPTIONS: { value: AccountCategory | ""; label: string }[] = [
  { value: "", label: "Uncategorized" },
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_cards", label: "Credit Cards" },
  { value: "retirement", label: "Retirement" },
  { value: "assets", label: "Assets" },
  { value: "crypto", label: "Crypto" },
];

function formatCurrency(value: number | null): string {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getAccountIcon(provider: string) {
  switch (provider) {
    case "Solana":
      return <Wallet className="h-5 w-5" />;
    case "SimpleFIN":
      return <Building2 className="h-5 w-5" />;
    default:
      return <Wallet className="h-5 w-5" />;
  }
}

interface AccountRowProps {
  account: Account;
  onUpdate: () => void;
}

function AccountRow({ account, onUpdate }: AccountRowProps) {
  const [isPending, startTransition] = useTransition();

  const handleToggleHidden = () => {
    startTransition(async () => {
      await updateAccount(account.id, { is_hidden: !account.is_hidden });
      onUpdate();
    });
  };

  const handleToggleNetWorth = () => {
    startTransition(async () => {
      await updateAccount(account.id, {
        include_in_net_worth: !account.include_in_net_worth,
      });
      onUpdate();
    });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as AccountCategory | "";
    startTransition(async () => {
      await updateAccount(account.id, {
        category: value === "" ? null : value,
      });
      onUpdate();
    });
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 hover:bg-muted/50 transition-colors",
        account.is_hidden && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-muted">
          {getAccountIcon(account.provider)}
        </div>
        <div>
          <p className="font-medium">{account.name}</p>
          <p className="text-sm text-muted-foreground">{account.provider}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Category dropdown */}
        <select
          value={account.category ?? ""}
          onChange={handleCategoryChange}
          disabled={isPending}
          className="px-2 py-1 text-sm rounded border border-input bg-background"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Include in net worth toggle */}
        <button
          onClick={handleToggleNetWorth}
          disabled={isPending}
          className={cn(
            "p-2 rounded-lg transition-colors",
            account.include_in_net_worth
              ? "bg-green-500/10 text-green-500"
              : "bg-muted text-muted-foreground"
          )}
          title={
            account.include_in_net_worth
              ? "Included in net worth"
              : "Excluded from net worth"
          }
        >
          <DollarSign className="h-4 w-4" />
        </button>

        {/* Hide toggle */}
        <button
          onClick={handleToggleHidden}
          disabled={isPending}
          className={cn(
            "p-2 rounded-lg transition-colors",
            account.is_hidden
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary"
          )}
          title={account.is_hidden ? "Show account" : "Hide account"}
        >
          {account.is_hidden ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>

        {/* Balance */}
        <div className="text-right min-w-[100px]">
          <p className="font-semibold">{formatCurrency(account.balance_usd)}</p>
        </div>
      </div>
    </div>
  );
}

export function AccountsTab({
  accounts,
  showHidden,
  onShowHiddenChange,
  onAccountUpdate,
}: AccountsTabProps) {
  // Filter accounts based on showHidden
  const visibleAccounts = showHidden
    ? accounts
    : accounts.filter((a) => !a.is_hidden);

  // Group accounts by category
  const groupedAccounts = CATEGORIES.map((cat) => ({
    ...cat,
    accounts: visibleAccounts.filter((a) =>
      cat.id === null ? !a.category : a.category === cat.id
    ),
  })).filter((group) => group.accounts.length > 0);

  const hiddenCount = accounts.filter((a) => a.is_hidden).length;

  if (accounts.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 text-center">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No accounts connected</h3>
        <p className="text-muted-foreground">
          Connect your financial accounts to start tracking your portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Show hidden toggle */}
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => onShowHiddenChange(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-sm text-muted-foreground">
              Show hidden accounts ({hiddenCount})
            </span>
          </label>
        </div>
      )}

      {/* Grouped accounts */}
      {groupedAccounts.map((group) => (
        <div
          key={group.id ?? "uncategorized"}
          className="bg-card rounded-lg border border-border"
        >
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">{group.label}</h3>
          </div>
          <div className="divide-y divide-border">
            {group.accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                onUpdate={onAccountUpdate}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
