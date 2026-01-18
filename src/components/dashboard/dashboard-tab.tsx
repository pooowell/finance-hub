"use client";

import { PortfolioChart, PortfolioSummary, ConnectAccount } from "@/components/dashboard";
import { RecentTransactions } from "./recent-transactions";

interface ChartDataPoint {
  timestamp: string;
  value: number;
}

interface PortfolioData {
  totalValueUsd: number;
  accountCount: number;
  lastSynced: string | null;
  change24h: number;
  changePercent24h: number;
}

interface DashboardTabProps {
  portfolioData: PortfolioData;
  chartData: ChartDataPoint[];
  isSyncing: boolean;
  onSync: () => void;
  onAccountConnect: () => void;
}

export function DashboardTab({
  portfolioData,
  chartData,
  isSyncing,
  onSync,
  onAccountConnect,
}: DashboardTabProps) {
  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <PortfolioSummary
        totalValue={portfolioData.totalValueUsd}
        change24h={portfolioData.change24h}
        changePercent24h={portfolioData.changePercent24h}
        accountCount={portfolioData.accountCount}
        lastSynced={portfolioData.lastSynced}
        onSync={onSync}
        isSyncing={isSyncing}
      />

      {/* Connect Account */}
      <ConnectAccount onSuccess={onAccountConnect} />

      {/* Portfolio Chart */}
      <PortfolioChart data={chartData} isLoading={isSyncing} />

      {/* Recent Transactions */}
      <RecentTransactions />
    </div>
  );
}
