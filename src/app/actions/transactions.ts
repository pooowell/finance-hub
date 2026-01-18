"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
type TransactionLabel = Database["public"]["Tables"]["transaction_labels"]["Row"];
type LabelRule = Database["public"]["Tables"]["label_rules"]["Row"];

export interface TransactionWithLabel extends Transaction {
  account_name: string;
  label?: TransactionLabel | null;
}

export interface LabelWithRules extends TransactionLabel {
  rules: LabelRule[];
}

export interface SpendingSummary {
  period: string;
  label: string;
  spending: number;
  income: number;
  net: number;
  transactionCount: number;
}

export interface TopSpender {
  name: string;
  amount: number;
  count: number;
  label?: TransactionLabel | null;
}

export interface TransactionsPageData {
  transactions: TransactionWithLabel[];
  labels: TransactionLabel[];
  summaries: SpendingSummary[];
  topSpending: TopSpender[];
  topIncome: TopSpender[];
  error?: string;
}

const LABEL_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

/**
 * Get spending summaries for all periods (call once on mount)
 */
export async function getSpendingSummaries(): Promise<{ summaries: SpendingSummary[]; labels: TransactionLabel[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { summaries: [], labels: [], error: "Unauthorized" };
  }

  // Get user's account IDs
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (!accounts || accounts.length === 0) {
    return { summaries: [], labels: [] };
  }

  const accountIds = accounts.map((a) => a.id);

  // Get labels
  const { data: labels } = await supabase
    .from("transaction_labels")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  // Get all transactions for summaries (only fetch what we need)
  const { data: allTransactions } = await supabase
    .from("transactions")
    .select("posted_at, amount")
    .in("account_id", accountIds);

  const now = new Date();
  const periods = [
    { period: "1d", label: "24 Hours", days: 1 },
    { period: "1w", label: "7 Days", days: 7 },
    { period: "1m", label: "30 Days", days: 30 },
    { period: "1y", label: "1 Year", days: 365 },
  ];

  const summaries: SpendingSummary[] = periods.map(({ period, label, days }) => {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const periodTransactions = (allTransactions ?? []).filter(
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

  return { summaries, labels: labels ?? [] };
}

/**
 * Get transactions for a specific period (call when period changes)
 */
export async function getTransactionsForPeriod(
  periodDays: number
): Promise<{ transactions: TransactionWithLabel[]; topSpending: TopSpender[]; topIncome: TopSpender[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { transactions: [], topSpending: [], topIncome: [], error: "Unauthorized" };
  }

  // Get user's accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", user.id);

  if (!accounts || accounts.length === 0) {
    return { transactions: [], topSpending: [], topIncome: [] };
  }

  const accountIds = accounts.map((a) => a.id);
  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));

  // Get labels for mapping
  const { data: labels } = await supabase
    .from("transaction_labels")
    .select("*")
    .eq("user_id", user.id);

  const labelMap = new Map((labels ?? []).map((l) => [l.id, l]));

  // Get transactions for period
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .in("account_id", accountIds)
    .gte("posted_at", cutoff.toISOString())
    .order("posted_at", { ascending: false });

  if (error) {
    return { transactions: [], topSpending: [], topIncome: [], error: error.message };
  }

  // Add account names and labels
  const transactionsWithLabels: TransactionWithLabel[] = (transactions ?? []).map((tx) => ({
    ...tx,
    account_name: accountNameMap.get(tx.account_id) ?? "Unknown Account",
    label: tx.label_id ? labelMap.get(tx.label_id) : null,
  }));

  // Calculate top spenders and income
  const spendingByPayee = new Map<string, { amount: number; count: number; label?: TransactionLabel | null }>();
  const incomeByPayee = new Map<string, { amount: number; count: number; label?: TransactionLabel | null }>();

  for (const tx of transactionsWithLabels) {
    const name = tx.payee || tx.description || "Unknown";

    if (tx.amount < 0) {
      const existing = spendingByPayee.get(name) || { amount: 0, count: 0, label: tx.label };
      existing.amount += Math.abs(tx.amount);
      existing.count += 1;
      spendingByPayee.set(name, existing);
    } else {
      const existing = incomeByPayee.get(name) || { amount: 0, count: 0, label: tx.label };
      existing.amount += tx.amount;
      existing.count += 1;
      incomeByPayee.set(name, existing);
    }
  }

  const topSpending: TopSpender[] = Array.from(spendingByPayee.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const topIncome: TopSpender[] = Array.from(incomeByPayee.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return { transactions: transactionsWithLabels, topSpending, topIncome };
}

/**
 * Get all labels with their rules
 */
export async function getLabelsWithRules(): Promise<{ labels: LabelWithRules[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { labels: [], error: "Unauthorized" };
  }

  const { data: labels } = await supabase
    .from("transaction_labels")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  const { data: rules } = await supabase
    .from("label_rules")
    .select("*")
    .eq("user_id", user.id);

  const rulesByLabel = new Map<string, LabelRule[]>();
  for (const rule of rules ?? []) {
    const existing = rulesByLabel.get(rule.label_id) || [];
    existing.push(rule);
    rulesByLabel.set(rule.label_id, existing);
  }

  const labelsWithRules: LabelWithRules[] = (labels ?? []).map((label) => ({
    ...label,
    rules: rulesByLabel.get(label.id) || [],
  }));

  return { labels: labelsWithRules };
}

/**
 * Create a new label
 */
export async function createLabel(
  name: string,
  color?: string
): Promise<{ label?: TransactionLabel; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized" };
  }

  // Get a random color if not provided
  const labelColor = color || LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];

  const { data: label, error } = await supabase
    .from("transaction_labels")
    .insert({
      user_id: user.id,
      name,
      color: labelColor,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { label };
}

/**
 * Delete a label
 */
export async function deleteLabel(labelId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("transaction_labels")
    .delete()
    .eq("id", labelId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Label a transaction and optionally create a matching rule
 */
export async function labelTransaction(
  transactionId: string,
  labelId: string | null,
  createRule?: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "Unauthorized" };
  }

  // Get the transaction to verify ownership and get details for rule
  const { data: transaction } = await supabase
    .from("transactions")
    .select("*, accounts!inner(user_id)")
    .eq("id", transactionId)
    .single();

  if (!transaction || (transaction.accounts as { user_id: string }).user_id !== user.id) {
    return { success: false, error: "Transaction not found" };
  }

  // Update the transaction label
  const { error: updateError } = await supabase
    .from("transactions")
    .update({ label_id: labelId })
    .eq("id", transactionId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Create a matching rule if requested
  if (createRule && labelId) {
    const matchPattern = transaction.payee || transaction.description;
    if (matchPattern) {
      await supabase.from("label_rules").insert({
        user_id: user.id,
        label_id: labelId,
        match_field: transaction.payee ? "payee" : "description",
        match_pattern: matchPattern,
      });
    }
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Apply matching rules to unlabeled transactions
 */
export async function applyLabelRules(): Promise<{ applied: number; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { applied: 0, error: "Unauthorized" };
  }

  // Get all rules
  const { data: rules } = await supabase
    .from("label_rules")
    .select("*")
    .eq("user_id", user.id);

  if (!rules || rules.length === 0) {
    return { applied: 0 };
  }

  // Get user's account IDs
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (!accounts || accounts.length === 0) {
    return { applied: 0 };
  }

  const accountIds = accounts.map((a) => a.id);

  // Get unlabeled transactions
  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .in("account_id", accountIds)
    .is("label_id", null);

  if (!transactions || transactions.length === 0) {
    return { applied: 0 };
  }

  let applied = 0;

  // Apply rules to each unlabeled transaction
  for (const tx of transactions) {
    for (const rule of rules) {
      const pattern = rule.match_pattern.toLowerCase();
      let matches = false;

      if (rule.match_field === "payee" && tx.payee) {
        matches = tx.payee.toLowerCase().includes(pattern);
      } else if (rule.match_field === "description") {
        matches = tx.description.toLowerCase().includes(pattern);
      } else if (rule.match_field === "both") {
        matches =
          tx.description.toLowerCase().includes(pattern) ||
          (tx.payee?.toLowerCase().includes(pattern) ?? false);
      }

      if (matches) {
        await supabase
          .from("transactions")
          .update({ label_id: rule.label_id })
          .eq("id", tx.id);
        applied++;
        break; // Only apply first matching rule
      }
    }
  }

  revalidatePath("/dashboard");
  return { applied };
}

/**
 * Create a label rule
 */
export async function createLabelRule(
  labelId: string,
  matchPattern: string,
  matchField: "description" | "payee" | "both" = "description"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase.from("label_rules").insert({
    user_id: user.id,
    label_id: labelId,
    match_field: matchField,
    match_pattern: matchPattern,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Delete a label rule
 */
export async function deleteLabelRule(ruleId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("label_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
