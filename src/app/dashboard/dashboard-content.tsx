"use client";

import { useState, useEffect, useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortfolioChart, PortfolioSummary, AccountsList, ConnectAccount } from "@/components/dashboard";
import { syncAllAccounts, getTotalPortfolioValue, getPortfolioHistory } from "@/app/actions/sync";
import { getSimpleFINAccounts } from "@/app/actions/simplefin";
import { getSolanaWallets } from "@/app/actions/solana";
import { createClient } from "@/lib/supabase/client";
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

  // Fetch data function (reusable)
  const fetchData = async () => {
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
  };

  // Fetch all data on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Handle sign out
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  };

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
      {/* Sign Out */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>

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

      {/* Connect Account */}
      <ConnectAccount onSuccess={fetchData} />

      {/* Portfolio Chart */}
      <PortfolioChart data={chartData} isLoading={isPending} />

      {/* Accounts List */}
      <AccountsList accounts={accounts} />
    </div>
  );
}
