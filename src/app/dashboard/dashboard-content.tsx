"use client";

import { useState, useEffect, useTransition } from "react";
import { PortfolioChart, PortfolioSummary, AccountsList } from "@/components/dashboard";
import { syncAllAccounts, getTotalPortfolioValue, getPortfolioHistory } from "@/app/actions/sync";
import { getSimpleFINAccounts } from "@/app/actions/simplefin";
import { getSolanaWallets } from "@/app/actions/solana";
import type { Database } from "@/types/database";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

interface PortfolioData {
  totalValueUsd: number;
  accountCount: number;
  lastSynced: string | null;
  change24h: number;
  changePercent24h: number;
}

interface ChartDataPoint {
  timestamp: string;
  value: number;
}

export function DashboardContent() {
  const [isPending, startTransition] = useTransition();
  const [portfolioData, setPortfolioData] = useState<PortfolioData>({
    totalValueUsd: 0,
    accountCount: 0,
    lastSynced: null,
    change24h: 0,
    changePercent24h: 0,
  });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [portfolioResult, historyResult, simplefinResult, solanaResult] =
          await Promise.all([
            getTotalPortfolioValue(),
            getPortfolioHistory({ interval: "1d" }),
            getSimpleFINAccounts(),
            getSolanaWallets(),
          ]);

        setPortfolioData({
          totalValueUsd: portfolioResult.totalValueUsd,
          accountCount: portfolioResult.accountCount,
          lastSynced: portfolioResult.lastSynced,
          change24h: 0, // TODO: Calculate from history
          changePercent24h: 0,
        });

        setChartData(historyResult);

        // Combine accounts from both providers
        const allAccounts = [
          ...(simplefinResult.accounts || []),
          ...(solanaResult.accounts || []),
        ];
        setAccounts(allAccounts);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  // Handle sync
  const handleSync = () => {
    startTransition(async () => {
      try {
        await syncAllAccounts();

        // Refresh data after sync
        const [portfolioResult, historyResult, simplefinResult, solanaResult] =
          await Promise.all([
            getTotalPortfolioValue(),
            getPortfolioHistory({ interval: "1d" }),
            getSimpleFINAccounts(),
            getSolanaWallets(),
          ]);

        setPortfolioData({
          totalValueUsd: portfolioResult.totalValueUsd,
          accountCount: portfolioResult.accountCount,
          lastSynced: portfolioResult.lastSynced,
          change24h: 0,
          changePercent24h: 0,
        });

        setChartData(historyResult);

        const allAccounts = [
          ...(simplefinResult.accounts || []),
          ...(solanaResult.accounts || []),
        ];
        setAccounts(allAccounts);
      } catch (error) {
        console.error("Sync error:", error);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-card rounded-lg border border-border p-6 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded mb-2" />
          <div className="h-10 w-48 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <PortfolioSummary
        totalValue={portfolioData.totalValueUsd}
        change24h={portfolioData.change24h}
        changePercent24h={portfolioData.changePercent24h}
        accountCount={portfolioData.accountCount}
        lastSynced={portfolioData.lastSynced}
        onSync={handleSync}
        isSyncing={isPending}
      />

      {/* Portfolio Chart */}
      <PortfolioChart data={chartData} isLoading={isPending} />

      {/* Accounts List */}
      <AccountsList accounts={accounts} />
    </div>
  );
}
