"use server";

import { createClient } from "@/lib/supabase/server";
import {
  claimSetupToken,
  fetchAccounts,
  transformAccounts,
  transformTransactions,
  createSnapshot,
} from "@/lib/simplefin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";
import type { User } from "@supabase/supabase-js";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

/**
 * Ensure user profile exists (for users created before migration)
 */
async function ensureProfileExists(supabase: Awaited<ReturnType<typeof createClient>>, user: User) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name,
      avatar_url: user.user_metadata?.avatar_url,
    });
    if (error) {
      console.error("Error creating profile:", error);
      throw new Error("Failed to create user profile");
    }
  }
}

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
    // Ensure profile exists
    await ensureProfileExists(supabase, user);

    // Claim the setup token to get access URL
    let accessUrl: string;
    try {
      accessUrl = await claimSetupToken(setupToken);
    } catch (claimError) {
      console.error("SimpleFIN claim error:", claimError);
      const message = claimError instanceof Error ? claimError.message : "Unknown error";
      return { error: `Failed to claim token: ${message}` };
    }

    // Store the access URL for future syncs
    await supabase
      .from("credentials")
      .upsert({
        user_id: user.id,
        provider: "SimpleFIN",
        access_token: accessUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });

    // Fetch and sync accounts immediately
    const syncResult = await syncSimpleFINAccounts(accessUrl);
    if (syncResult.error) {
      return { error: syncResult.error };
    }

    revalidatePath("/dashboard");
    return { success: true, accountCount: syncResult.accountCount };
  } catch (error) {
    console.error("SimpleFIN connection error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Failed to connect SimpleFIN: ${message}` };
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

  // Retrieve accessUrl from credentials table if not provided
  if (!accessUrl) {
    const { data: credentials } = await supabase
      .from("credentials")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "SimpleFIN")
      .single();

    if (!credentials?.access_token) {
      return { error: "No SimpleFIN credentials found. Please reconnect your account." };
    }

    accessUrl = credentials.access_token;
  }

  try {
    // Ensure profile exists
    await ensureProfileExists(supabase, user);

    // Fetch accounts from SimpleFIN (with transactions from last 90 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    let accountSet;
    try {
      accountSet = await fetchAccounts({ accessUrl }, { startDate });
    } catch (fetchError) {
      console.error("SimpleFIN fetch error:", fetchError);
      const message = fetchError instanceof Error ? fetchError.message : "Unknown error";
      return { error: `Failed to fetch accounts: ${message}` };
    }

    if (accountSet.errors.length > 0) {
      console.warn("SimpleFIN returned errors:", accountSet.errors);
    }

    // Transform accounts to our format
    const accounts = transformAccounts(accountSet.accounts, user.id);

    // Upsert accounts (update existing or insert new)
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const simplefinAccount = accountSet.accounts[i];
      let accountId: string;

      // Check if account already exists
      const { data: existingAccount } = await supabase
        .from("accounts")
        .select("id, balance_usd")
        .eq("user_id", user.id)
        .eq("external_id", account.external_id ?? "")
        .single();

      if (existingAccount) {
        accountId = existingAccount.id;

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

        accountId = newAccount.id;

        // Create initial snapshot
        const snapshot = createSnapshot(
          newAccount.id,
          account.balance_usd ?? 0
        );
        await supabase.from("snapshots").insert(snapshot);
      }

      // Sync transactions for this account
      if (simplefinAccount.transactions && simplefinAccount.transactions.length > 0) {
        const transactions = transformTransactions(simplefinAccount.transactions, accountId);

        // Upsert transactions (ignore conflicts on unique constraint)
        for (const tx of transactions) {
          await supabase
            .from("transactions")
            .upsert(tx, { onConflict: "account_id,external_id" });
        }
      }
    }

    revalidatePath("/dashboard");
    return { success: true, accountCount: accounts.length };
  } catch (error) {
    console.error("SimpleFIN sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Failed to sync accounts: ${message}` };
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
