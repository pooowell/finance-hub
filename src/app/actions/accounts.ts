"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AccountCategory, Database } from "@/types/database";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

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
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify user owns this account
  const { data: account, error: fetchError } = await supabase
    .from("accounts")
    .select("id, user_id")
    .eq("id", accountId)
    .single();

  if (fetchError || !account) {
    return { success: false, error: "Account not found" };
  }

  if (account.user_id !== user.id) {
    return { success: false, error: "Unauthorized" };
  }

  // Update the account
  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (updateError) {
    return { success: false, error: updateError.message };
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
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { transactions: [], error: "Unauthorized" };
  }

  // Get user's account IDs
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", user.id);

  if (!accounts || accounts.length === 0) {
    return { transactions: [] };
  }

  const accountIds = accounts.map((a) => a.id);
  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));

  // Fetch recent transactions
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .in("account_id", accountIds)
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { transactions: [], error: error.message };
  }

  // Add account names to transactions
  const transactionsWithAccounts: TransactionWithAccount[] = (transactions ?? []).map((tx) => ({
    ...tx,
    account_name: accountNameMap.get(tx.account_id) ?? "Unknown Account",
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
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { transactions: [], summaries: [], error: "Unauthorized" };
  }

  // Get user's account IDs
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", user.id);

  if (!accounts || accounts.length === 0) {
    return { transactions: [], summaries: [] };
  }

  const accountIds = accounts.map((a) => a.id);
  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));

  // Fetch all transactions
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .in("account_id", accountIds)
    .order("posted_at", { ascending: false });

  if (error) {
    return { transactions: [], summaries: [], error: error.message };
  }

  // Add account names to transactions
  const transactionsWithAccounts: TransactionWithAccount[] = (transactions ?? []).map((tx) => ({
    ...tx,
    account_name: accountNameMap.get(tx.account_id) ?? "Unknown Account",
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
      (tx) => new Date(tx.posted_at) >= cutoff
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
