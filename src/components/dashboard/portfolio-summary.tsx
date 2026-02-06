"use client";

import { ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PortfolioSummaryProps {
  totalValue: number;
  change24h: number;
  changePercent24h: number;
  accountCount: number;
  lastSynced: string | null;
  onSync?: () => void;
  isSyncing?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function PortfolioSummary({
  totalValue,
  change24h,
  changePercent24h,
  accountCount,
  lastSynced,
  onSync,
  isSyncing,
}: PortfolioSummaryProps) {
  const isPositive = change24h >= 0;

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {formatCurrency(totalValue)}
          </h2>

          {/* 24h Change */}
          <div className="flex items-center gap-2 mt-2">
            <div
              className={cn(
                "flex items-center gap-1",
                isPositive ? "text-green-500" : "text-red-500"
              )}
            >
              {isPositive ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              <span className="font-medium">
                {formatCurrency(Math.abs(change24h))}
              </span>
              <span className="text-sm">
                ({isPositive ? "+" : ""}{changePercent24h.toFixed(2)}%)
              </span>
            </div>
            <span className="text-sm text-muted-foreground">24h</span>
          </div>
        </div>

        {/* Sync Button */}
        {onSync && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync"}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-border">
        <div>
          <p className="text-sm text-muted-foreground">Connected Accounts</p>
          <p className="text-xl font-semibold">{accountCount}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Last Synced</p>
          <p className="text-xl font-semibold">{formatRelativeTime(lastSynced)}</p>
        </div>
      </div>
    </div>
  );
}
