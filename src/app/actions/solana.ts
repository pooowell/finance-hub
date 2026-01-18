"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getWalletData,
  isValidSolanaAddress,
  transformWalletToAccount,
  createWalletSnapshot,
} from "@/lib/solana";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

/**
 * Connect a Solana wallet by address
 */
export async function connectSolanaWallet(walletAddress: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized" };
  }

  // Validate wallet address
  if (!isValidSolanaAddress(walletAddress)) {
    return { error: "Invalid Solana wallet address" };
  }

  try {
    // Check if wallet already connected
    const { data: existingAccount } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("external_id", walletAddress)
      .eq("provider", "Solana")
      .single();

    if (existingAccount) {
      return { error: "Wallet already connected" };
    }

    // Fetch wallet data
    const walletData = await getWalletData(walletAddress);

    // Transform to account format
    const account = transformWalletToAccount(walletData, user.id);

    // Insert account
    const { data: newAccount, error: insertError } = await supabase
      .from("accounts")
      .insert(account)
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting Solana account:", insertError);
      return { error: "Failed to connect wallet" };
    }

    // Create initial snapshot
    if (newAccount) {
      const snapshot = createWalletSnapshot(newAccount.id, walletData.totalValueUsd);
      await supabase.from("snapshots").insert(snapshot);
    }

    revalidatePath("/dashboard");
    return {
      success: true,
      totalValueUsd: walletData.totalValueUsd,
      tokenCount: walletData.tokens.length,
    };
  } catch (error) {
    console.error("Solana wallet connection error:", error);
    return { error: "Failed to fetch wallet data" };
  }
}

/**
 * Sync all Solana wallets for the current user
 */
export async function syncSolanaWallets() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Get all Solana accounts for user
    const { data: accounts, error: fetchError } = await supabase
      .from("accounts")
      .select("id, external_id, balance_usd")
      .eq("user_id", user.id)
      .eq("provider", "Solana");

    if (fetchError) {
      return { error: "Failed to fetch accounts" };
    }

    if (!accounts || accounts.length === 0) {
      return { success: true, synced: 0 };
    }

    let syncedCount = 0;

    for (const account of accounts) {
      if (!account.external_id) continue;

      try {
        // Fetch fresh wallet data
        const walletData = await getWalletData(account.external_id);

        // Update account
        const { error: updateError } = await supabase
          .from("accounts")
          .update({
            balance_usd: walletData.totalValueUsd,
            metadata: {
              sol_balance: walletData.solBalanceUi,
              sol_price_usd: walletData.solPriceUsd,
              sol_value_usd: walletData.solValueUsd,
              token_count: walletData.tokens.length,
              tokens: walletData.tokens.map((t) => ({
                mint: t.mint,
                symbol: t.symbol,
                balance: t.uiBalance,
                value_usd: t.valueUsd,
              })),
            },
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        if (updateError) {
          console.error("Error updating Solana account:", updateError);
          continue;
        }

        // Create snapshot if balance changed
        if (account.balance_usd !== walletData.totalValueUsd) {
          const snapshot = createWalletSnapshot(account.id, walletData.totalValueUsd);
          await supabase.from("snapshots").insert(snapshot);
        }

        syncedCount++;
      } catch (error) {
        console.error(`Error syncing wallet ${account.external_id}:`, error);
      }
    }

    revalidatePath("/dashboard");
    return { success: true, synced: syncedCount };
  } catch (error) {
    console.error("Solana sync error:", error);
    return { error: "Failed to sync wallets" };
  }
}

/**
 * Remove a Solana wallet
 */
export async function removeSolanaWallet(accountId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized" };
  }

  // Verify ownership and delete
  const { error: deleteError } = await supabase
    .from("accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id)
    .eq("provider", "Solana");

  if (deleteError) {
    return { error: "Failed to remove wallet" };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Get all Solana wallets for the current user
 */
export async function getSolanaWallets(): Promise<{
  error?: string;
  accounts: Account[];
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized", accounts: [] };
  }

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "Solana")
    .order("name");

  if (error) {
    return { error: "Failed to fetch wallets", accounts: [] };
  }

  return { accounts: accounts ?? [] };
}
