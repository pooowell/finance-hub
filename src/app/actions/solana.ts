"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { validateRequest, DEFAULT_USER_ID } from "@/lib/auth";
import { db, accounts, snapshots } from "@/lib/db";
import type { Account } from "@/lib/db/schema";
import {
  getWalletData,
  isValidSolanaAddress,
  transformWalletToAccount,
  createWalletSnapshot,
} from "@/lib/solana";

// Generate a random ID (replaces lucia's generateIdFromEntropySize)
function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Connect a Solana wallet by address
 */
export async function connectSolanaWallet(walletAddress: string) {
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Validate wallet address
  if (!isValidSolanaAddress(walletAddress)) {
    return { error: "Invalid Solana wallet address" };
  }

  try {
    // Check if wallet already connected
    const existingAccount = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, DEFAULT_USER_ID),
          eq(accounts.externalId, walletAddress),
          eq(accounts.provider, "Solana")
        )
      )
      .get();

    if (existingAccount) {
      return { error: "Wallet already connected" };
    }

    // Fetch wallet data
    const walletData = await getWalletData(walletAddress);

    // Transform to account format
    const account = transformWalletToAccount(walletData, DEFAULT_USER_ID);

    // Insert account
    const accountId = generateId();
    db.insert(accounts)
      .values({
        id: accountId,
        userId: DEFAULT_USER_ID,
        provider: account.provider,
        name: account.name,
        type: account.type,
        balanceUsd: account.balance_usd,
        externalId: account.external_id,
        metadata: JSON.stringify(account.metadata),
        lastSyncedAt: account.last_synced_at,
      })
      .run();

    // Create initial snapshot
    const snapshot = createWalletSnapshot(accountId, walletData.totalValueUsd);
    db.insert(snapshots)
      .values({
        id: generateId(),
        accountId: snapshot.account_id,
        timestamp: snapshot.timestamp,
        valueUsd: snapshot.value_usd,
      })
      .run();

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
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized" };
  }

  try {
    // Get all Solana accounts
    const solanaAccounts = db
      .select({
        id: accounts.id,
        externalId: accounts.externalId,
        balanceUsd: accounts.balanceUsd,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, DEFAULT_USER_ID),
          eq(accounts.provider, "Solana")
        )
      )
      .all();

    if (solanaAccounts.length === 0) {
      return { success: true, synced: 0 };
    }

    let syncedCount = 0;

    for (const account of solanaAccounts) {
      if (!account.externalId) continue;

      try {
        // Fetch fresh wallet data
        const walletData = await getWalletData(account.externalId);

        // Update account
        db.update(accounts)
          .set({
            balanceUsd: walletData.totalValueUsd,
            metadata: JSON.stringify({
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
            }),
            lastSyncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(accounts.id, account.id))
          .run();

        // Create snapshot if balance changed
        if (account.balanceUsd !== walletData.totalValueUsd) {
          const snapshot = createWalletSnapshot(account.id, walletData.totalValueUsd);
          db.insert(snapshots)
            .values({
              id: generateId(),
              accountId: snapshot.account_id,
              timestamp: snapshot.timestamp,
              valueUsd: snapshot.value_usd,
            })
            .run();
        }

        syncedCount++;
      } catch (error) {
        console.error(`Error syncing wallet ${account.externalId}:`, error);
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
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Delete the account
  const result = db
    .delete(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.userId, DEFAULT_USER_ID),
        eq(accounts.provider, "Solana")
      )
    )
    .run();

  if (result.changes === 0) {
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
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized", accounts: [] };
  }

  const solanaAccounts = db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, DEFAULT_USER_ID),
        eq(accounts.provider, "Solana")
      )
    )
    .orderBy(accounts.name)
    .all();

  return { accounts: solanaAccounts };
}
