"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, desc } from "drizzle-orm";
import { validateRequest, DEFAULT_USER_ID } from "@/lib/auth";
import { db, accounts, transactions } from "@/lib/db";
import type { AccountCategory } from "@/types/database";
import type { Transaction } from "@/lib/db/schema";

export interface TransactionWithAccount extends Transaction {
  account_name: string;
}

interface UpdateAccountData {
  is_hidden?: boolean;
  include_in_net_worth?: boolean;
  category?: AccountCategory | null;
}

export async function updateAccount(
  accountId: string,
  data: UpdateAccountData
): Promise<{ success: boolean; error?: string }> {
  const { user } = await validateRequest();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify account exists
  const account = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();

  if (!account) {
    return { success: false, error: "Account not found" };
  }

  // Update the account
  try {
    db.update(accounts)
      .set({
        isHidden: data.is_hidden,
        includeInNetWorth: data.include_in_net_worth,
        category: data.category,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(accounts.id, accountId))
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Get recent transactions for the current user
 */
export async function getRecentTransactions(
  limit: number = 10
): Promise<{ transactions: TransactionWithAccount[]; error?: string }> {
  const { user } = await validateRequest();

  if (!user) {
    return { transactions: [], error: "Unauthorized" };
  }

  // Get all accounts (single user app)
  const userAccounts = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.userId, DEFAULT_USER_ID))
    .all();

  if (userAccounts.length === 0) {
    return { transactions: [] };
  }

  const accountIds = userAccounts.map((a) => a.id);
  const accountNameMap = new Map(userAccounts.map((a) => [a.id, a.name]));

  // Fetch recent transactions
  const txList = db
    .select()
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds))
    .orderBy(desc(transactions.postedAt))
    .limit(limit)
    .all();

  // Add account names to transactions
  const transactionsWithAccounts: TransactionWithAccount[] = txList.map((tx) => ({
    ...tx,
    account_name: accountNameMap.get(tx.accountId) ?? "Unknown Account",
  }));

  return { transactions: transactionsWithAccounts };
}

export interface SpendingSummary {
  period: string;
  label: string;
  spending: number;
  income: number;
  net: number;
  transactionCount: number;
}

export interface TransactionsData {
  transactions: TransactionWithAccount[];
  summaries: SpendingSummary[];
  error?: string;
}

/**
 * Get all transactions with spending summaries for the current user
 */
export async function getAllTransactions(): Promise<TransactionsData> {
  const { user } = await validateRequest();

  if (!user) {
    return { transactions: [], summaries: [], error: "Unauthorized" };
  }

  // Get all accounts (single user app)
  const userAccounts = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.userId, DEFAULT_USER_ID))
    .all();

  if (userAccounts.length === 0) {
    return { transactions: [], summaries: [] };
  }

  const accountIds = userAccounts.map((a) => a.id);
  const accountNameMap = new Map(userAccounts.map((a) => [a.id, a.name]));

  // Fetch all transactions
  const txList = db
    .select()
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds))
    .orderBy(desc(transactions.postedAt))
    .all();

  // Add account names to transactions
  const transactionsWithAccounts: TransactionWithAccount[] = txList.map((tx) => ({
    ...tx,
    account_name: accountNameMap.get(tx.accountId) ?? "Unknown Account",
  }));

  // Calculate spending summaries
  const now = new Date();
  const periods = [
    { period: "1d", label: "24 Hours", days: 1 },
    { period: "1w", label: "7 Days", days: 7 },
    { period: "1m", label: "30 Days", days: 30 },
    { period: "1y", label: "1 Year", days: 365 },
  ];

  const summaries: SpendingSummary[] = periods.map(({ period, label, days }) => {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const periodTransactions = transactionsWithAccounts.filter(
      (tx) => new Date(tx.postedAt) >= cutoff
    );

    let spending = 0;
    let income = 0;

    for (const tx of periodTransactions) {
      if (tx.amount < 0) {
        spending += Math.abs(tx.amount);
      } else {
        income += tx.amount;
      }
    }

    return {
      period,
      label,
      spending,
      income,
      net: income - spending,
      transactionCount: periodTransactions.length,
    };
  });

  return { transactions: transactionsWithAccounts, summaries };
}
