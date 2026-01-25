"use client";

import { Wallet, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Account } from "@/types/database";

interface AccountsListProps {
  accounts: Account[];
}

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

function getAccountTypeColor(type: string): string {
  switch (type) {
    case "checking":
      return "bg-blue-500/10 text-blue-500";
    case "savings":
      return "bg-green-500/10 text-green-500";
    case "credit":
      return "bg-orange-500/10 text-orange-500";
    case "investment":
      return "bg-purple-500/10 text-purple-500";
    case "crypto":
      return "bg-yellow-500/10 text-yellow-500";
    default:
      return "bg-gray-500/10 text-gray-500";
  }
}

export function AccountsList({ accounts }: AccountsListProps) {
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

  // Sort by balance descending
  const sortedAccounts = [...accounts].sort(
    (a, b) => (b.balanceUsd ?? 0) - (a.balanceUsd ?? 0)
  );

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold">Connected Accounts</h3>
      </div>
      <div className="divide-y divide-border">
        {sortedAccounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                {getAccountIcon(account.provider)}
              </div>
              <div>
                <p className="font-medium">{account.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      getAccountTypeColor(account.type)
                    )}
                  >
                    {account.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {account.provider}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatCurrency(account.balanceUsd)}</p>
              {account.lastSyncedAt && (
                <p className="text-xs text-muted-foreground">
                  Synced {new Date(account.lastSyncedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
