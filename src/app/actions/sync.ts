"use server";

import { eq, inArray, and, gte, lte, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { validateRequest, DEFAULT_USER_ID } from "@/lib/auth";
import { db, accounts, snapshots } from "@/lib/db";
import { syncSimpleFINAccounts } from "./simplefin";
import { syncSolanaWallets } from "./solana";

interface SyncResult {
  simplefin: { success: boolean; synced?: number; error?: string };
  solana: { success: boolean; synced?: number; error?: string };
  totalSynced: number;
}

/**
 * Sync all accounts for the current user
 * Calls both SimpleFIN and Solana sync functions
 */
export async function syncAllAccounts(): Promise<SyncResult> {
  const { user } = await validateRequest();

  if (!user) {
    return {
      simplefin: { success: false, error: "Unauthorized" },
      solana: { success: false, error: "Unauthorized" },
      totalSynced: 0,
    };
  }

  // Sync both providers in parallel
  const [simplefinResult, solanaResult] = await Promise.all([
    syncSimpleFINAccounts().catch((e) => ({
      error: e.message || "SimpleFIN sync failed",
    })),
    syncSolanaWallets().catch((e) => ({
      error: e.message || "Solana sync failed",
    })),
  ]);

  const result: SyncResult = {
    simplefin: {
      success: !simplefinResult.error,
      synced: "accountCount" in simplefinResult ? simplefinResult.accountCount : 0,
      error: simplefinResult.error,
    },
    solana: {
      success: !solanaResult.error,
      synced: "synced" in solanaResult ? solanaResult.synced : 0,
      error: solanaResult.error,
    },
    totalSynced: 0,
  };

  result.totalSynced =
    (result.simplefin.synced || 0) + (result.solana.synced || 0);

  revalidatePath("/dashboard");
  return result;
}

/**
 * Get total portfolio value for the current user
 */
export async function getTotalPortfolioValue(): Promise<{
  totalValueUsd: number;
  accountCount: number;
  lastSynced: string | null;
}> {
  const { user } = await validateRequest();

  if (!user) {
    return { totalValueUsd: 0, accountCount: 0, lastSynced: null };
  }

  const userAccounts = db
    .select({
      balanceUsd: accounts.balanceUsd,
      lastSyncedAt: accounts.lastSyncedAt,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, DEFAULT_USER_ID),
        eq(accounts.includeInNetWorth, true)
      )
    )
    .all();

  if (userAccounts.length === 0) {
    return { totalValueUsd: 0, accountCount: 0, lastSynced: null };
  }

  const totalValueUsd = userAccounts.reduce(
    (sum, acc) => sum + (acc.balanceUsd || 0),
    0
  );

  // Get most recent sync time
  const lastSynced = userAccounts.reduce((latest, acc) => {
    if (!acc.lastSyncedAt) return latest;
    if (!latest) return acc.lastSyncedAt;
    return acc.lastSyncedAt > latest ? acc.lastSyncedAt : latest;
  }, null as string | null);

  return {
    totalValueUsd,
    accountCount: userAccounts.length,
    lastSynced,
  };
}

/**
 * Get portfolio history for charting
 */
export async function getPortfolioHistory(options?: {
  startDate?: Date;
  endDate?: Date;
  interval?: "1h" | "1d" | "1w" | "1m";
}): Promise<{ timestamp: string; value: number }[]> {
  const { user } = await validateRequest();

  if (!user) {
    return [];
  }

  // Get all account IDs (only those included in net worth)
  const userAccounts = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, DEFAULT_USER_ID),
        eq(accounts.includeInNetWorth, true)
      )
    )
    .all();

  if (userAccounts.length === 0) {
    return [];
  }

  const accountIds = userAccounts.map((a) => a.id);

  // Build conditions
  const conditions = [inArray(snapshots.accountId, accountIds)];

  if (options?.startDate) {
    conditions.push(gte(snapshots.timestamp, options.startDate.toISOString()));
  }
  if (options?.endDate) {
    conditions.push(lte(snapshots.timestamp, options.endDate.toISOString()));
  }

  const snapshotList = db
    .select({
      timestamp: snapshots.timestamp,
      valueUsd: snapshots.valueUsd,
      accountId: snapshots.accountId,
    })
    .from(snapshots)
    .where(and(...conditions))
    .orderBy(asc(snapshots.timestamp))
    .all();

  if (snapshotList.length === 0) {
    return [];
  }

  // Aggregate snapshots by timestamp
  // Group by time bucket based on interval
  const bucketMs = {
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
    "1m": 30 * 24 * 60 * 60 * 1000,
  }[options?.interval || "1d"];

  const buckets = new Map<number, { total: number; count: number }>();

  for (const snapshot of snapshotList) {
    const ts = new Date(snapshot.timestamp).getTime();
    const bucketKey = Math.floor(ts / bucketMs) * bucketMs;

    const existing = buckets.get(bucketKey) || { total: 0, count: 0 };
    existing.total += snapshot.valueUsd;
    existing.count += 1;
    buckets.set(bucketKey, existing);
  }

  // Convert to array format
  const history = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, { total }]) => ({
      timestamp: new Date(timestamp).toISOString(),
      value: total,
    }));

  return history;
}

/**
 * Trigger sync via Edge Function - removed for SQLite migration
 * Edge functions are no longer used with local SQLite
 */
export async function triggerEdgeFunctionSync(): Promise<{
  success: boolean;
  error?: string;
}> {
  return {
    success: false,
    error: "Edge function sync is not available with local SQLite database. Use syncAllAccounts() instead."
  };
}
