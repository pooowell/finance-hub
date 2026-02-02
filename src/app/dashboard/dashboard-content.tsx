"use client";

import { useState, useEffect, useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TabNavigation,
  DashboardTab,
  AccountsTab,
  TransactionsTab,
  SettingsTab,
  type TabType,
} from "@/components/dashboard";
import { syncAllAccounts, getTotalPortfolioValue, getPortfolioHistory } from "@/app/actions/sync";
import { getSimpleFINAccounts } from "@/app/actions/simplefin";
import { getSolanaWallets } from "@/app/actions/solana";
import { signout } from "@/lib/auth/actions";
import type { Account } from "@/lib/db/schema";
import { calculate24hChange, type ChartDataPoint } from "@/lib/portfolio";

interface PortfolioData {
  totalValueUsd: number;
  accountCount: number;
  lastSynced: string | null;
  change24h: number;
  changePercent24h: number;
}

export function DashboardContent() {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [showHidden, setShowHidden] = useState(false);
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

      const { change24h, changePercent24h } = calculate24hChange(
        historyResult,
        portfolioResult.totalValueUsd,
      );

      setPortfolioData({
        totalValueUsd: portfolioResult.totalValueUsd,
        accountCount: portfolioResult.accountCount,
        lastSynced: portfolioResult.lastSynced,
        change24h,
        changePercent24h,
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
    await signout();
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

        const { change24h, changePercent24h } = calculate24hChange(
          historyResult,
          portfolioResult.totalValueUsd,
        );

        setPortfolioData({
          totalValueUsd: portfolioResult.totalValueUsd,
          accountCount: portfolioResult.accountCount,
          lastSynced: portfolioResult.lastSynced,
          change24h,
          changePercent24h,
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

  // Handle account update (refresh accounts after update)
  const handleAccountUpdate = () => {
    startTransition(async () => {
      try {
        const [portfolioResult, simplefinResult, solanaResult] = await Promise.all([
          getTotalPortfolioValue(),
          getSimpleFINAccounts(),
          getSolanaWallets(),
        ]);

        setPortfolioData((prev) => ({
          ...prev,
          totalValueUsd: portfolioResult.totalValueUsd,
          accountCount: portfolioResult.accountCount,
          lastSynced: portfolioResult.lastSynced,
        }));

        const allAccounts = [
          ...(simplefinResult.accounts || []),
          ...(solanaResult.accounts || []),
        ];
        setAccounts(allAccounts);
      } catch (error) {
        console.error("Error refreshing accounts:", error);
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
      {/* Header with Sign Out */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>

      {/* Tab Navigation */}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === "dashboard" && (
        <DashboardTab
          portfolioData={portfolioData}
          chartData={chartData}
          isSyncing={isPending}
          onSync={handleSync}
          onAccountConnect={fetchData}
        />
      )}

      {activeTab === "accounts" && (
        <AccountsTab
          accounts={accounts}
          showHidden={showHidden}
          onShowHiddenChange={setShowHidden}
          onAccountUpdate={handleAccountUpdate}
        />
      )}

      {activeTab === "transactions" && <TransactionsTab />}

      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}
