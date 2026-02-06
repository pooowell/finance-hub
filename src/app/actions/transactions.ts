"use server";

import { eq, and, inArray, isNull, gte, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { validateRequest, DEFAULT_USER_ID } from "@/lib/auth";
import { db, accounts, transactions, transactionLabels, labelRules } from "@/lib/db";
import type { Transaction, TransactionLabel, LabelRule } from "@/lib/db/schema";

// Generate a random ID (replaces lucia's generateIdFromEntropySize)
function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

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
  const { user } = await validateRequest();

  if (!user) {
    return { summaries: [], labels: [], error: "Unauthorized" };
  }

  // Get all accounts
  const userAccounts = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, DEFAULT_USER_ID))
    .all();

  if (userAccounts.length === 0) {
    return { summaries: [], labels: [] };
  }

  const accountIds = userAccounts.map((a) => a.id);

  // Get labels
  const labels = db
    .select()
    .from(transactionLabels)
    .where(eq(transactionLabels.userId, DEFAULT_USER_ID))
    .orderBy(transactionLabels.name)
    .all();

  // Get all transactions for summaries (only fetch what we need)
  const allTransactions = db
    .select({
      postedAt: transactions.postedAt,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds))
    .all();

  const now = new Date();
  const periods = [
    { period: "1d", label: "24 Hours", days: 1 },
    { period: "1w", label: "7 Days", days: 7 },
    { period: "1m", label: "30 Days", days: 30 },
    { period: "1y", label: "1 Year", days: 365 },
  ];

  const summaries: SpendingSummary[] = periods.map(({ period, label, days }) => {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const periodTransactions = allTransactions.filter(
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

  return { summaries, labels };
}

/**
 * Get transactions for a specific period (call when period changes)
 */
export async function getTransactionsForPeriod(
  periodDays: number
): Promise<{ transactions: TransactionWithLabel[]; topSpending: TopSpender[]; topIncome: TopSpender[]; error?: string }> {
  const { user } = await validateRequest();

  if (!user) {
    return { transactions: [], topSpending: [], topIncome: [], error: "Unauthorized" };
  }

  // Get all accounts
  const userAccounts = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.userId, DEFAULT_USER_ID))
    .all();

  if (userAccounts.length === 0) {
    return { transactions: [], topSpending: [], topIncome: [] };
  }

  const accountIds = userAccounts.map((a) => a.id);
  const accountNameMap = new Map(userAccounts.map((a) => [a.id, a.name]));

  // Get labels for mapping
  const labels = db
    .select()
    .from(transactionLabels)
    .where(eq(transactionLabels.userId, DEFAULT_USER_ID))
    .all();

  const labelMap = new Map(labels.map((l) => [l.id, l]));

  // Get transactions for period
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);

  const txList = db
    .select()
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        gte(transactions.postedAt, cutoff.toISOString())
      )
    )
    .orderBy(desc(transactions.postedAt))
    .all();

  // Add account names and labels
  const transactionsWithLabels: TransactionWithLabel[] = txList.map((tx) => ({
    ...tx,
    account_name: accountNameMap.get(tx.accountId) ?? "Unknown Account",
    label: tx.labelId ? labelMap.get(tx.labelId) : null,
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
  const { user } = await validateRequest();

  if (!user) {
    return { labels: [], error: "Unauthorized" };
  }

  const labels = db
    .select()
    .from(transactionLabels)
    .where(eq(transactionLabels.userId, DEFAULT_USER_ID))
    .orderBy(transactionLabels.name)
    .all();

  const rules = db
    .select()
    .from(labelRules)
    .where(eq(labelRules.userId, DEFAULT_USER_ID))
    .all();

  const rulesByLabel = new Map<string, LabelRule[]>();
  for (const rule of rules) {
    const existing = rulesByLabel.get(rule.labelId) || [];
    existing.push(rule);
    rulesByLabel.set(rule.labelId, existing);
  }

  const labelsWithRules: LabelWithRules[] = labels.map((label) => ({
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
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Get a random color if not provided
  const labelColor = color || LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];

  try {
    const labelId = generateId();
    db.insert(transactionLabels)
      .values({
        id: labelId,
        userId: DEFAULT_USER_ID,
        name,
        color: labelColor,
      })
      .run();

    const label = db
      .select()
      .from(transactionLabels)
      .where(eq(transactionLabels.id, labelId))
      .get();

    revalidatePath("/dashboard");
    return { label: label ?? undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: message };
  }
}

/**
 * Delete a label
 */
export async function deleteLabel(labelId: string): Promise<{ success: boolean; error?: string }> {
  const { user } = await validateRequest();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const result = db
    .delete(transactionLabels)
    .where(
      and(
        eq(transactionLabels.id, labelId),
        eq(transactionLabels.userId, DEFAULT_USER_ID)
      )
    )
    .run();

  if (result.changes === 0) {
    return { success: false, error: "Label not found" };
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
  const { user } = await validateRequest();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Get the transaction to verify it exists and get details for rule
  const transaction = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      payee: transactions.payee,
      description: transactions.description,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get();

  if (!transaction) {
    return { success: false, error: "Transaction not found" };
  }

  // Update the transaction label
  db.update(transactions)
    .set({ labelId })
    .where(eq(transactions.id, transactionId))
    .run();

  // Create a matching rule if requested
  if (createRule && labelId) {
    const matchPattern = transaction.payee || transaction.description;
    if (matchPattern) {
      db.insert(labelRules)
        .values({
          id: generateId(),
          userId: DEFAULT_USER_ID,
          labelId,
          matchField: transaction.payee ? "payee" : "description",
          matchPattern,
        })
        .run();
    }
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Apply matching rules to unlabeled transactions
 */
export async function applyLabelRules(): Promise<{ applied: number; error?: string }> {
  const { user } = await validateRequest();

  if (!user) {
    return { applied: 0, error: "Unauthorized" };
  }

  // Get all rules
  const rules = db
    .select()
    .from(labelRules)
    .where(eq(labelRules.userId, DEFAULT_USER_ID))
    .all();

  if (rules.length === 0) {
    return { applied: 0 };
  }

  // Get all account IDs
  const userAccounts = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, DEFAULT_USER_ID))
    .all();

  if (userAccounts.length === 0) {
    return { applied: 0 };
  }

  const accountIds = userAccounts.map((a) => a.id);

  // Get unlabeled transactions
  const unlabeledTx = db
    .select()
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        isNull(transactions.labelId)
      )
    )
    .all();

  if (unlabeledTx.length === 0) {
    return { applied: 0 };
  }

  let applied = 0;

  // Apply rules to each unlabeled transaction
  for (const tx of unlabeledTx) {
    for (const rule of rules) {
      const pattern = rule.matchPattern.toLowerCase();
      let matches = false;

      if (rule.matchField === "payee" && tx.payee) {
        matches = tx.payee.toLowerCase().includes(pattern);
      } else if (rule.matchField === "description") {
        matches = tx.description.toLowerCase().includes(pattern);
      } else if (rule.matchField === "both") {
        matches =
          tx.description.toLowerCase().includes(pattern) ||
          (tx.payee?.toLowerCase().includes(pattern) ?? false);
      }

      if (matches) {
        db.update(transactions)
          .set({ labelId: rule.labelId })
          .where(eq(transactions.id, tx.id))
          .run();
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
  const { user } = await validateRequest();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    db.insert(labelRules)
      .values({
        id: generateId(),
        userId: DEFAULT_USER_ID,
        labelId,
        matchField,
        matchPattern,
      })
      .run();

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Delete a label rule
 */
export async function deleteLabelRule(ruleId: string): Promise<{ success: boolean; error?: string }> {
  const { user } = await validateRequest();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const result = db
    .delete(labelRules)
    .where(
      and(
        eq(labelRules.id, ruleId),
        eq(labelRules.userId, DEFAULT_USER_ID)
      )
    )
    .run();

  if (result.changes === 0) {
    return { success: false, error: "Rule not found" };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
