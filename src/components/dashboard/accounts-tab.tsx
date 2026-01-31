"use client";

import {
  Wallet,
  Building2,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Landmark,
  Bitcoin,
  HelpCircle,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/db/schema";

interface AccountsTabProps {
  accounts: Account[];
  showHidden: boolean;
  onShowHiddenChange: (show: boolean) => void;
  onAccountUpdate: () => void;
}

type AccountCategory =
  | "checking"
  | "savings"
  | "credit_cards"
  | "retirement"
  | "assets"
  | "crypto";

interface CategoryConfig {
  id: AccountCategory | null;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: "checking",
    label: "Checking",
    icon: <Landmark className="h-5 w-5" />,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "savings",
    label: "Savings",
    icon: <PiggyBank className="h-5 w-5" />,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    id: "credit_cards",
    label: "Credit Cards",
    icon: <CreditCard className="h-5 w-5" />,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    id: "retirement",
    label: "Retirement",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    id: "assets",
    label: "Assets",
    icon: <Building2 className="h-5 w-5" />,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    id: "crypto",
    label: "Crypto",
    icon: <Bitcoin className="h-5 w-5" />,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  {
    id: null,
    label: "Uncategorized",
    icon: <HelpCircle className="h-5 w-5" />,
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
  },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

interface CategorySummary {
  config: CategoryConfig;
  total: number;
  accountCount: number;
  includeInNetWorth: boolean;
}

export function AccountsTab({
  accounts,
  showHidden,
  onShowHiddenChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onAccountUpdate,
}: AccountsTabProps) {
  // Only include visible accounts (unless showHidden is on)
  const visibleAccounts = showHidden
    ? accounts
    : accounts.filter((a) => !a.isHidden);

  // Aggregate by category
  const categorySummaries: CategorySummary[] = CATEGORIES.map((config) => {
    const catAccounts = visibleAccounts.filter((a) =>
      config.id === null ? !a.category : a.category === config.id
    );
    const total = catAccounts.reduce((sum, a) => sum + (a.balanceUsd ?? 0), 0);
    const allIncluded = catAccounts.every((a) => a.includeInNetWorth);
    return {
      config,
      total,
      accountCount: catAccounts.length,
      includeInNetWorth: allIncluded,
    };
  }).filter((s) => s.accountCount > 0);

  // Net worth total (only accounts marked includeInNetWorth)
  const netWorthTotal = visibleAccounts
    .filter((a) => a.includeInNetWorth)
    .reduce((sum, a) => sum + (a.balanceUsd ?? 0), 0);

  const hiddenCount = accounts.filter((a) => a.isHidden).length;

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
    <div className="space-y-6">
      {/* Net Worth Header */}
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Net Worth</p>
            <h2 className="text-3xl font-bold tracking-tight">
              {formatCurrency(netWorthTotal)}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {visibleAccounts.length} account{visibleAccounts.length !== 1 ? "s" : ""} across {categorySummaries.length} categor{categorySummaries.length !== 1 ? "ies" : "y"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-8 w-8 text-primary opacity-20" />
          </div>
        </div>
      </div>

      {/* Show hidden toggle */}
      {hiddenCount > 0 && (
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
      )}

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categorySummaries.map((summary) => {
          const isNegative = summary.total < 0;
          return (
            <div
              key={summary.config.id ?? "uncategorized"}
              className="bg-card rounded-lg border border-border p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2.5 rounded-lg",
                      summary.config.bgColor,
                      summary.config.color
                    )}
                  >
                    {summary.config.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold">{summary.config.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {summary.accountCount} account{summary.accountCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                {!summary.includeInNetWorth && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    Excluded
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-2xl font-bold",
                  isNegative ? "text-red-500" : "text-foreground"
                )}
              >
                {formatCurrency(summary.total)}
              </p>
              {/* Percentage of net worth */}
              {netWorthTotal !== 0 && summary.includeInNetWorth && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {Math.abs((summary.total / netWorthTotal) * 100).toFixed(1)}% of net worth
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        summary.config.bgColor.replace("/10", "/40")
                      )}
                      style={{
                        width: `${Math.min(Math.abs((summary.total / netWorthTotal) * 100), 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
