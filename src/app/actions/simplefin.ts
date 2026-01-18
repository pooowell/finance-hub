"use server";

import { createClient } from "@/lib/supabase/server";
import {
  claimSetupToken,
  fetchAccounts,
  transformAccounts,
  createSnapshot,
} from "@/lib/simplefin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

/**
 * Connect a SimpleFIN account using a setup token
 */
export async function connectSimpleFIN(setupToken: string) {
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
    // Claim the setup token to get access URL
    const accessUrl = await claimSetupToken(setupToken);

    // Note: In production, store accessUrl securely using Supabase Vault
    // or encrypted in a separate credentials table.
    // For now, we proceed directly to syncing.

    // Fetch and sync accounts immediately
    const syncResult = await syncSimpleFINAccounts(accessUrl);
    if (syncResult.error) {
      return { error: syncResult.error };
    }

    revalidatePath("/dashboard");
    return { success: true, accountCount: syncResult.accountCount };
  } catch (error) {
    console.error("SimpleFIN connection error:", error);
    return { error: "Failed to connect SimpleFIN" };
  }
}

/**
 * Sync SimpleFIN accounts and create snapshots
 * In production, the accessUrl should be retrieved from secure storage
 */
export async function syncSimpleFINAccounts(accessUrl?: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized" };
  }

  // In production, retrieve accessUrl from secure storage if not provided
  if (!accessUrl) {
    return { error: "No SimpleFIN credentials found" };
  }

  try {
    // Fetch accounts from SimpleFIN
    const accountSet = await fetchAccounts({ accessUrl });

    if (accountSet.errors.length > 0) {
      console.warn("SimpleFIN returned errors:", accountSet.errors);
    }

    // Transform accounts to our format
    const accounts = transformAccounts(accountSet.accounts, user.id);

    // Upsert accounts (update existing or insert new)
    for (const account of accounts) {
      // Check if account already exists
      const { data: existingAccount } = await supabase
        .from("accounts")
        .select("id, balance_usd")
        .eq("user_id", user.id)
        .eq("external_id", account.external_id ?? "")
        .single();

      if (existingAccount) {
        // Update existing account
        const { error: updateError } = await supabase
          .from("accounts")
          .update({
            balance_usd: account.balance_usd,
            name: account.name,
            metadata: account.metadata,
            last_synced_at: account.last_synced_at,
          })
          .eq("id", existingAccount.id);

        if (updateError) {
          console.error("Error updating account:", updateError);
          continue;
        }

        // Create snapshot if balance changed
        if (existingAccount.balance_usd !== account.balance_usd) {
          const snapshot = createSnapshot(
            existingAccount.id,
            account.balance_usd ?? 0
          );
          await supabase.from("snapshots").insert(snapshot);
        }
      } else {
        // Insert new account
        const { data: newAccount, error: insertError } = await supabase
          .from("accounts")
          .insert(account)
          .select("id")
          .single();

        if (insertError) {
          console.error("Error inserting account:", insertError);
          continue;
        }

        // Create initial snapshot
        if (newAccount) {
          const snapshot = createSnapshot(
            newAccount.id,
            account.balance_usd ?? 0
          );
          await supabase.from("snapshots").insert(snapshot);
        }
      }
    }

    revalidatePath("/dashboard");
    return { success: true, accountCount: accounts.length };
  } catch (error) {
    console.error("SimpleFIN sync error:", error);
    return { error: "Failed to sync accounts" };
  }
}

/**
 * Get all SimpleFIN accounts for the current user
 */
export async function getSimpleFINAccounts(): Promise<{
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
    .eq("provider", "SimpleFIN")
    .order("name");

  if (error) {
    return { error: "Failed to fetch accounts", accounts: [] };
  }

  return { accounts: accounts ?? [] };
}
