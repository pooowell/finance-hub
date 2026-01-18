"use server";

import { createClient } from "@/lib/supabase/server";
import { syncSimpleFINAccounts } from "./simplefin";
import { syncSolanaWallets } from "./solana";
import { revalidatePath } from "next/cache";
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
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      simplefin: { success: false, error: "Unauthorized" },
      solana: { success: false, error: "Unauthorized" },
      totalSynced: 0,
    };
  }

  // Sync both providers in parallel
  const [simplefinResult, solanaResult] = await Promise.all([
    // SimpleFIN sync - Note: In production, retrieve stored access URL
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
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { totalValueUsd: 0, accountCount: 0, lastSynced: null };
  }

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("balance_usd, last_synced_at")
    .eq("user_id", user.id);

  if (error || !accounts) {
    return { totalValueUsd: 0, accountCount: 0, lastSynced: null };
  }

  const totalValueUsd = accounts.reduce(
    (sum, acc) => sum + (acc.balance_usd || 0),
    0
  );

  // Get most recent sync time
  const lastSynced = accounts.reduce((latest, acc) => {
    if (!acc.last_synced_at) return latest;
    if (!latest) return acc.last_synced_at;
    return acc.last_synced_at > latest ? acc.last_synced_at : latest;
  }, null as string | null);

  return {
    totalValueUsd,
    accountCount: accounts.length,
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
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Get user's account IDs
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (!accounts || accounts.length === 0) {
    return [];
  }

  const accountIds = accounts.map((a) => a.id);

  // Build query for snapshots
  let query = supabase
    .from("snapshots")
    .select("timestamp, value_usd, account_id")
    .in("account_id", accountIds)
    .order("timestamp", { ascending: true });

  if (options?.startDate) {
    query = query.gte("timestamp", options.startDate.toISOString());
  }
  if (options?.endDate) {
    query = query.lte("timestamp", options.endDate.toISOString());
  }

  const { data: snapshots, error } = await query;

  if (error || !snapshots) {
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

  for (const snapshot of snapshots) {
    const ts = new Date(snapshot.timestamp).getTime();
    const bucketKey = Math.floor(ts / bucketMs) * bucketMs;

    const existing = buckets.get(bucketKey) || { total: 0, count: 0 };
    existing.total += snapshot.value_usd;
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
 * Trigger sync via Edge Function (for cron jobs or external triggers)
 */
export async function triggerEdgeFunctionSync(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { error } = await supabase.functions.invoke("sync-accounts", {
      body: { userId: user.id },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
