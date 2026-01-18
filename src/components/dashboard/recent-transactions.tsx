"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRecentTransactions, type TransactionWithAccount } from "@/app/actions/accounts";

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
  });
}

export function RecentTransactions() {
  const [transactions, setTransactions] = useState<TransactionWithAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTransactions() {
      setIsLoading(true);
      try {
        const result = await getRecentTransactions(10);
        setTransactions(result.transactions);
      } catch (error) {
        console.error("Error fetching transactions:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTransactions();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Recent Transactions</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-muted rounded-full" />
                <div>
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded mt-1" />
                </div>
              </div>
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Recent Transactions</h3>
        </div>
        <div className="text-center py-8">
          <ArrowRightLeft className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No transactions yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Transactions will appear here after syncing your bank accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Recent Transactions</h3>
        </div>
      </div>
      <div className="divide-y divide-border">
        {transactions.map((tx) => {
          const isCredit = tx.amount > 0;
          return (
            <div
              key={tx.id}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
            >
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
                  <p className="font-medium text-sm">
                    {tx.payee || tx.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.account_name} • {formatDate(tx.posted_at)}
                  </p>
                </div>
              </div>
              <p
                className={cn(
                  "font-semibold",
                  isCredit ? "text-green-500" : "text-foreground"
                )}
              >
                {isCredit ? "+" : "-"}{formatCurrency(tx.amount)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
