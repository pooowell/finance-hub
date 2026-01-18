/**
 * Transform SimpleFIN data to database schema
 */

import type { SimpleFINAccount, SimpleFINTransaction } from "@/types/simplefin";
import { inferAccountType } from "@/types/simplefin";
import type { Database } from "@/types/database";

type AccountInsert = Database["public"]["Tables"]["accounts"]["Insert"];
type SnapshotInsert = Database["public"]["Tables"]["snapshots"]["Insert"];
type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];

/**
 * Transforms a SimpleFIN account to our database account format
 */
export function transformAccount(
  simplefinAccount: SimpleFINAccount,
  userId: string
): AccountInsert {
  const accountType = inferAccountType(simplefinAccount.org, simplefinAccount.name);

  return {
    user_id: userId,
    provider: "SimpleFIN",
    name: `${simplefinAccount.org.name} - ${simplefinAccount.name}`,
    type: accountType,
    balance_usd: parseFloat(simplefinAccount.balance),
    external_id: simplefinAccount.id,
    metadata: {
      org_domain: simplefinAccount.org.domain,
      org_name: simplefinAccount.org.name,
      currency: simplefinAccount.currency,
      available_balance: simplefinAccount["available-balance"],
    },
    last_synced_at: new Date().toISOString(),
  };
}

/**
 * Creates a snapshot from an account balance
 */
export function createSnapshot(
  accountId: string,
  balance: number,
  timestamp?: Date
): SnapshotInsert {
  return {
    account_id: accountId,
    value_usd: balance,
    timestamp: (timestamp ?? new Date()).toISOString(),
  };
}

/**
 * Transforms multiple SimpleFIN accounts to database format
 */
export function transformAccounts(
  simplefinAccounts: SimpleFINAccount[],
  userId: string
): AccountInsert[] {
  return simplefinAccounts.map((account) => transformAccount(account, userId));
}

/**
 * Transforms a SimpleFIN transaction to our database transaction format
 */
export function transformTransaction(
  transaction: SimpleFINTransaction,
  accountId: string
): TransactionInsert {
  return {
    account_id: accountId,
    external_id: transaction.id,
    posted_at: new Date(transaction.posted * 1000).toISOString(),
    amount: parseFloat(transaction.amount),
    description: transaction.description,
    payee: transaction.payee ?? null,
    memo: transaction.memo ?? null,
    pending: transaction.pending ?? false,
  };
}

/**
 * Transforms multiple SimpleFIN transactions to database format
 */
export function transformTransactions(
  transactions: SimpleFINTransaction[],
  accountId: string
): TransactionInsert[] {
  return transactions.map((tx) => transformTransaction(tx, accountId));
}
