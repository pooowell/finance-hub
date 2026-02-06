"use client";

import { useTransition } from "react";
import { Wallet, Building2, Eye, EyeOff, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateAccount } from "@/app/actions/accounts";
import type { Account, AccountCategory } from "@/types/database";

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
      return <Wallet className="h-4 w-4" />;
    case "SimpleFIN":
      return <Building2 className="h-4 w-4" />;
    default:
      return <Wallet className="h-4 w-4" />;
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
      await updateAccount(account.id, { is_hidden: !account.isHidden });
      onUpdate();
    });
  };

  const handleToggleNetWorth = () => {
    startTransition(async () => {
      await updateAccount(account.id, {
        include_in_net_worth: !account.includeInNetWorth,
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
        "p-3 sm:p-4 hover:bg-muted/50 transition-colors",
        account.isHidden && "opacity-60"
      )}
    >
      {/* Top row: icon + name + balance */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-full bg-muted shrink-0">
            {getAccountIcon(account.provider)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{account.name}</p>
            <p className="text-xs text-muted-foreground">{account.provider}</p>
          </div>
        </div>
        <p className="font-semibold text-sm whitespace-nowrap">{formatCurrency(account.balanceUsd)}</p>
      </div>

      {/* Bottom row: controls */}
      <div className="flex items-center gap-2 mt-2 ml-8">
        <select
          value={account.category ?? ""}
          onChange={handleCategoryChange}
          disabled={isPending}
          className="px-1.5 py-0.5 text-xs rounded border border-input bg-background flex-shrink-0"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          onClick={handleToggleNetWorth}
          disabled={isPending}
          className={cn(
            "p-1 rounded transition-colors",
            account.includeInNetWorth
              ? "bg-green-500/10 text-green-500"
              : "bg-muted text-muted-foreground"
          )}
          title={account.includeInNetWorth ? "Included in net worth" : "Excluded from net worth"}
        >
          <DollarSign className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={handleToggleHidden}
          disabled={isPending}
          className={cn(
            "p-1 rounded transition-colors",
            account.isHidden
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary"
          )}
          title={account.isHidden ? "Show account" : "Hide account"}
        >
          {account.isHidden ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
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
  const visibleAccounts = showHidden
    ? accounts
    : accounts.filter((a) => !a.isHidden);

  const groupedAccounts = CATEGORIES.map((cat) => ({
    ...cat,
    accounts: visibleAccounts.filter((a) =>
      cat.id === null ? !a.category : a.category === cat.id
    ),
    total: visibleAccounts
      .filter((a) => (cat.id === null ? !a.category : a.category === cat.id))
      .reduce((sum, a) => sum + (a.balanceUsd || 0), 0),
  })).filter((group) => group.accounts.length > 0);

  const hiddenCount = accounts.filter((a) => a.isHidden).length;

  if (accounts.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 text-center">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No accounts connected</h3>
        <p className="text-muted-foreground">
          Connect your financial accounts in Settings to start tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
              Show hidden ({hiddenCount})
            </span>
          </label>
        </div>
      )}

      {groupedAccounts.map((group) => (
        <div
          key={group.id ?? "uncategorized"}
          className="bg-card rounded-lg border border-border"
        >
          <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">{group.label}</h3>
            <span className="text-sm text-muted-foreground font-medium">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(group.total)}
            </span>
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
