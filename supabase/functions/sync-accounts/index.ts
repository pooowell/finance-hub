/**
 * Supabase Edge Function: sync-accounts
 * Polls all providers and writes snapshots to the database.
 *
 * This function can be invoked via:
 * - HTTP request (manual trigger)
 * - Supabase cron job (scheduled sync)
 *
 * Deploy with: supabase functions deploy sync-accounts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";

// Jupiter Price API
const JUPITER_PRICE_API = "https://price.jup.ag/v6/price";

interface Account {
  id: string;
  user_id: string;
  provider: "SimpleFIN" | "Solana";
  external_id: string | null;
  balance_usd: number | null;
  metadata: Record<string, unknown>;
}

interface SyncResult {
  accountId: string;
  provider: string;
  success: boolean;
  previousBalance: number | null;
  newBalance: number | null;
  error?: string;
}

/**
 * Fetches SOL price from Jupiter
 */
async function getSolPrice(): Promise<number | null> {
  try {
    const response = await fetch(
      `${JUPITER_PRICE_API}?ids=So11111111111111111111111111111111111111112`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.["So11111111111111111111111111111111111111112"]?.price ?? null;
  } catch {
    return null;
  }
}

/**
 * Syncs a Solana wallet
 */
async function syncSolanaWallet(
  account: Account
): Promise<{ balance: number; metadata: Record<string, unknown> }> {
  if (!account.external_id) {
    throw new Error("No wallet address");
  }

  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const publicKey = new PublicKey(account.external_id);

  // Fetch SOL balance
  const lamports = await connection.getBalance(publicKey);
  const solBalance = lamports / LAMPORTS_PER_SOL;

  // Get SOL price
  const solPrice = await getSolPrice();
  const solValueUsd = solPrice ? solBalance * solPrice : 0;

  // For simplicity, we're only tracking SOL balance in the edge function
  // Full token sync happens in the Next.js server action
  return {
    balance: solValueUsd,
    metadata: {
      sol_balance: solBalance,
      sol_price_usd: solPrice,
      sol_value_usd: solValueUsd,
      synced_by: "edge-function",
    },
  };
}

/**
 * Main sync handler
 */
async function syncAllAccounts(userId?: string): Promise<SyncResult[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: SyncResult[] = [];

  // Build query
  let query = supabase.from("accounts").select("*");

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: accounts, error } = await query;

  if (error) {
    console.error("Failed to fetch accounts:", error);
    throw new Error("Failed to fetch accounts");
  }

  if (!accounts || accounts.length === 0) {
    return results;
  }

  for (const account of accounts as Account[]) {
    const result: SyncResult = {
      accountId: account.id,
      provider: account.provider,
      success: false,
      previousBalance: account.balance_usd,
      newBalance: null,
    };

    try {
      let newBalance: number;
      let newMetadata: Record<string, unknown>;

      if (account.provider === "Solana") {
        const syncData = await syncSolanaWallet(account);
        newBalance = syncData.balance;
        newMetadata = { ...account.metadata, ...syncData.metadata };
      } else {
        // SimpleFIN sync requires access URL which we don't have in edge function
        // Skip SimpleFIN accounts - they should be synced via the Next.js app
        result.error = "SimpleFIN sync not supported in edge function";
        results.push(result);
        continue;
      }

      // Update account
      const { error: updateError } = await supabase
        .from("accounts")
        .update({
          balance_usd: newBalance,
          metadata: newMetadata,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", account.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Create snapshot if balance changed
      if (account.balance_usd !== newBalance) {
        await supabase.from("snapshots").insert({
          account_id: account.id,
          value_usd: newBalance,
          timestamp: new Date().toISOString(),
        });
      }

      result.success = true;
      result.newBalance = newBalance;
    } catch (err) {
      result.error = err instanceof Error ? err.message : "Unknown error";
    }

    results.push(result);
  }

  return results;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Check for authorization (optional - for user-specific syncs)
    let userId: string | undefined;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace("Bearer ", "");

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    // Parse request body for options
    let syncOptions: { userId?: string } = {};
    if (req.method === "POST") {
      try {
        syncOptions = await req.json();
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Use userId from body if not from auth header
    if (!userId && syncOptions.userId) {
      userId = syncOptions.userId;
    }

    console.log(`Starting sync${userId ? ` for user ${userId}` : " for all users"}`);

    const results = await syncAllAccounts(userId);

    const summary = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };

    console.log(`Sync complete: ${summary.successful}/${summary.total} accounts synced`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
