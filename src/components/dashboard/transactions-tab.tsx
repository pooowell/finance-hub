"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingDown,
  TrendingUp,
  Tag,
  Plus,
  X,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getSpendingSummaries,
  getTransactionsForPeriod,
  createLabel,
  labelTransaction,
  applyLabelRules,
  type TransactionWithLabel,
  type SpendingSummary,
  type TopSpender,
} from "@/app/actions/transactions";
import type { TransactionLabel } from "@/types/database";
import { logger } from "@/lib/logger";

type TimePeriod = "1d" | "1w" | "1m" | "1y";
type ViewMode = "overview" | "spending" | "income";

const PERIOD_DAYS: Record<TimePeriod, number> = {
  "1d": 1,
  "1w": 7,
  "1m": 30,
  "1y": 365,
};

const PERIOD_LABELS: Record<TimePeriod, string> = {
  "1d": "24 Hours",
  "1w": "7 Days",
  "1m": "30 Days",
  "1y": "1 Year",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface SpendingCardProps {
  summary: SpendingSummary;
  isSelected: boolean;
  onClick: () => void;
}

function SpendingCard({ summary, isSelected, onClick }: SpendingCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-card rounded-lg border p-4 text-left transition-all w-full",
        isSelected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/50"
      )}
    >
      <p className="text-sm text-muted-foreground mb-1">{summary.label}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-sm">Spent</span>
          </div>
          <span className="font-semibold text-red-500">
            {formatCurrency(summary.spending)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm">Income</span>
          </div>
          <span className="font-semibold text-green-500">
            {formatCurrency(summary.income)}
          </span>
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="text-sm font-medium">Net</span>
          <span
            className={cn(
              "font-semibold",
              summary.net >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {summary.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(summary.net))}
          </span>
        </div>
      </div>
    </button>
  );
}

interface TopListProps {
  title: string;
  items: TopSpender[];
  type: "spending" | "income";
}

function TopList({ title, items, type }: TopListProps) {
  const colorClass = type === "spending" ? "text-red-500" : "text-green-500";
  const bgClass = type === "spending" ? "bg-red-500/10" : "bg-green-500/10";

  if (items.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <h4 className="font-semibold mb-3">{title}</h4>
        <p className="text-sm text-muted-foreground text-center py-4">
          No {type} in this period
        </p>
      </div>
    );
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">{title}</h4>
        <span className={cn("font-semibold", colorClass)}>
          {formatCurrency(total)}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => {
          const percentage = (item.amount / total) * 100;
          return (
            <div key={index} className="relative">
              <div
                className={cn("absolute inset-0 rounded", bgClass)}
                style={{ width: `${percentage}%` }}
              />
              <div className="relative flex items-center justify-between p-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate max-w-[150px]">
                    {item.name}
                  </span>
                  {item.label && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: item.label.color + "20", color: item.label.color }}
                    >
                      {item.label.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {item.count}x
                  </span>
                  <span className={cn("text-sm font-medium", colorClass)}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TransactionRowProps {
  transaction: TransactionWithLabel;
  labels: TransactionLabel[];
  onLabel: (transactionId: string, labelId: string | null, createRule: boolean) => void;
}

function TransactionRow({ transaction, labels, onLabel }: TransactionRowProps) {
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const isCredit = transaction.amount > 0;

  return (
    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "p-2 rounded-full",
            isCredit ? "bg-green-500/10" : "bg-red-500/10"
          )}
        >
          {isCredit ? (
            <ArrowDownLeft className="h-4 w-4 text-green-500" />
          ) : (
            <ArrowUpRight className="h-4 w-4 text-red-500" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">
              {transaction.payee || transaction.description}
            </p>
            {transaction.label && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: transaction.label.color + "20",
                  color: transaction.label.color,
                }}
              >
                {transaction.label.name}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {transaction.account_name} • {formatDate(transaction.postedAt)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setShowLabelMenu(!showLabelMenu)}
            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
            title="Add label"
          >
            <Tag className="h-4 w-4 text-muted-foreground" />
          </button>

          {showLabelMenu && (
            <div className="absolute right-0 top-8 z-10 bg-popover border border-border rounded-lg shadow-lg p-2 min-w-[160px]">
              <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                Select label
              </div>
              {labels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => {
                    onLabel(transaction.id, label.id, true);
                    setShowLabelMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="text-sm">{label.name}</span>
                </button>
              ))}
              {transaction.label && (
                <button
                  onClick={() => {
                    onLabel(transaction.id, null, false);
                    setShowLabelMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                  <span className="text-sm">Remove label</span>
                </button>
              )}
            </div>
          )}
        </div>

        <p
          className={cn(
            "font-semibold min-w-[80px] text-right",
            isCredit ? "text-green-500" : "text-foreground"
          )}
        >
          {isCredit ? "+" : "-"}{formatCurrency(transaction.amount)}
        </p>
      </div>
    </div>
  );
}

export function TransactionsTab() {
  const [isPending, startTransition] = useTransition();
  const [transactions, setTransactions] = useState<TransactionWithLabel[]>([]);
  const [labels, setLabels] = useState<TransactionLabel[]>([]);
  const [summaries, setSummaries] = useState<SpendingSummary[]>([]);
  const [topSpending, setTopSpending] = useState<TopSpender[]>([]);
  const [topIncome, setTopIncome] = useState<TopSpender[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1m");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");

  // Fetch summaries once on mount
  const fetchSummaries = async () => {
    try {
      const result = await getSpendingSummaries();
      setSummaries(result.summaries);
      setLabels(result.labels);
    } catch (error: unknown) {
      logger.error('TransactionsTab', 'Error fetching summaries', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // Fetch transactions for selected period
  const fetchTransactions = async (period: TimePeriod) => {
    setIsLoading(true);
    try {
      const days = PERIOD_DAYS[period];
      const result = await getTransactionsForPeriod(days);
      setTransactions(result.transactions);
      setTopSpending(result.topSpending);
      setTopIncome(result.topIncome);
    } catch (error: unknown) {
      logger.error('TransactionsTab', 'Error fetching transactions', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh all data (after labeling, etc.)
  const refreshData = async () => {
    await Promise.all([
      fetchSummaries(),
      fetchTransactions(selectedPeriod),
    ]);
  };

  // Initial load - fetch summaries once
  useEffect(() => {
    fetchSummaries();
  }, []);

  // Fetch transactions when period changes or on initial load
  useEffect(() => {
    fetchTransactions(selectedPeriod);
  }, [selectedPeriod]);

  const handleCreateLabel = () => {
    if (!newLabelName.trim()) return;

    startTransition(async () => {
      await createLabel(newLabelName.trim());
      setNewLabelName("");
      setShowNewLabel(false);
      refreshData();
    });
  };

  const handleLabelTransaction = (
    transactionId: string,
    labelId: string | null,
    createRule: boolean
  ) => {
    startTransition(async () => {
      await labelTransaction(transactionId, labelId, createRule);
      fetchTransactions(selectedPeriod);
    });
  };

  const handleApplyRules = () => {
    startTransition(async () => {
      const result = await applyLabelRules();
      if (result.applied > 0) {
        fetchTransactions(selectedPeriod);
      }
    });
  };

  const currentSummary = summaries.find((s) => s.period === selectedPeriod);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
              <div className="h-4 w-16 bg-muted rounded mb-3" />
              <div className="space-y-2">
                <div className="h-5 w-24 bg-muted rounded" />
                <div className="h-5 w-24 bg-muted rounded" />
                <div className="h-5 w-20 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0 && summaries.every((s) => s.transactionCount === 0)) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 text-center">
        <ArrowRightLeft className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No transactions yet</h3>
        <p className="text-muted-foreground">
          Transactions will appear here after syncing your bank accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Labels Management */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {viewMode !== "overview" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("overview")}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <h2 className="text-lg font-semibold">
            {viewMode === "overview" && "Transactions"}
            {viewMode === "spending" && `Top Spending - ${PERIOD_LABELS[selectedPeriod]}`}
            {viewMode === "income" && `Top Income - ${PERIOD_LABELS[selectedPeriod]}`}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleApplyRules}
            disabled={isPending || labels.length === 0}
            className="gap-1"
          >
            <Sparkles className="h-4 w-4" />
            Auto-label
          </Button>

          {showNewLabel ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="Label name..."
                className="px-2 py-1 text-sm rounded border border-input bg-background w-32"
                onKeyDown={(e) => e.key === "Enter" && handleCreateLabel()}
                autoFocus
              />
              <Button size="sm" onClick={handleCreateLabel} disabled={isPending}>
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewLabel(false);
                  setNewLabelName("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewLabel(true)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              New Label
            </Button>
          )}
        </div>
      </div>

      {/* Labels Bar */}
      {labels.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Labels:</span>
          {labels.map((label) => (
            <span
              key={label.id}
              className="text-xs px-2 py-1 rounded-full"
              style={{
                backgroundColor: label.color + "20",
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {viewMode === "overview" && (
        <>
          {/* Period Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summaries.map((summary) => (
              <SpendingCard
                key={summary.period}
                summary={summary}
                isSelected={selectedPeriod === summary.period}
                onClick={() => setSelectedPeriod(summary.period as TimePeriod)}
              />
            ))}
          </div>

          {/* Top Spending/Income Breakdown */}
          {currentSummary && currentSummary.transactionCount > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              <div
                className="cursor-pointer"
                onClick={() => setViewMode("spending")}
              >
                <TopList
                  title="Top Spending"
                  items={topSpending.slice(0, 5)}
                  type="spending"
                                  />
              </div>
              <div
                className="cursor-pointer"
                onClick={() => setViewMode("income")}
              >
                <TopList
                  title="Top Income"
                  items={topIncome.slice(0, 5)}
                  type="income"
                                  />
              </div>
            </div>
          )}

          {/* Transactions List */}
          <div className="bg-card rounded-lg border border-border">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">
                    Transactions - {PERIOD_LABELS[selectedPeriod]}
                  </h3>
                </div>
                <span className="text-sm text-muted-foreground">
                  {transactions.length} transactions
                </span>
              </div>
            </div>
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                                    labels={labels}
                  onLabel={handleLabelTransaction}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === "spending" && (
        <div className="space-y-4">
          <TopList
            title={`All Spending - ${PERIOD_LABELS[selectedPeriod]}`}
            items={topSpending}
            type="spending"
                      />

          {/* Spending transactions */}
          <div className="bg-card rounded-lg border border-border">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Spending Transactions</h3>
            </div>
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {transactions
                .filter((tx) => tx.amount < 0)
                .map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                                        labels={labels}
                  onLabel={handleLabelTransaction}
                  />
                ))}
            </div>
          </div>
        </div>
      )}

      {viewMode === "income" && (
        <div className="space-y-4">
          <TopList
            title={`All Income - ${PERIOD_LABELS[selectedPeriod]}`}
            items={topIncome}
            type="income"
                      />

          {/* Income transactions */}
          <div className="bg-card rounded-lg border border-border">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Income Transactions</h3>
            </div>
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {transactions
                .filter((tx) => tx.amount > 0)
                .map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                                        labels={labels}
                  onLabel={handleLabelTransaction}
                  />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
