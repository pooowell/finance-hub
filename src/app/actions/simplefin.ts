"use server";

import { eq, and } from "drizzle-orm";
import { generateIdFromEntropySize } from "lucia";
import { revalidatePath } from "next/cache";
import { validateRequest } from "@/lib/auth";
import { db, accounts, credentials, snapshots, transactions } from "@/lib/db";
import type { Account } from "@/lib/db/schema";
import {
  claimSetupToken,
  fetchAccounts,
  transformAccounts,
  transformTransactions,
  createSnapshot,
} from "@/lib/simplefin";
import { logger } from "@/lib/logger";

/**
 * Connect a SimpleFIN account using a setup token
 */
export async function connectSimpleFIN(setupToken: string) {
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized" };
  }

  try {
    // Claim the setup token to get access URL
    let accessUrl: string;
    try {
      accessUrl = await claimSetupToken(setupToken);
    } catch (claimError: unknown) {
      logger.error('simplefin', 'SimpleFIN claim error', { error: claimError instanceof Error ? claimError.message : String(claimError) });
      const message = claimError instanceof Error ? claimError.message : "Unknown error";
      return { error: `Failed to claim token: ${message}` };
    }

    // Store the access URL for future syncs (upsert)
    const existingCred = db
      .select({ id: credentials.id })
      .from(credentials)
      .where(
        and(
          eq(credentials.userId, user.id),
          eq(credentials.provider, "SimpleFIN")
        )
      )
      .get();

    if (existingCred) {
      db.update(credentials)
        .set({
          accessToken: accessUrl,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(credentials.id, existingCred.id))
        .run();
    } else {
      db.insert(credentials)
        .values({
          id: generateIdFromEntropySize(10),
          userId: user.id,
          provider: "SimpleFIN",
          accessToken: accessUrl,
        })
        .run();
    }

    // Fetch and sync accounts immediately
    const syncResult = await syncSimpleFINAccounts(accessUrl);
    if (syncResult.error) {
      return { error: syncResult.error };
    }

    revalidatePath("/dashboard");
    return { success: true, accountCount: syncResult.accountCount };
  } catch (error: unknown) {
    logger.error('simplefin', 'SimpleFIN connection error', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Failed to connect SimpleFIN: ${message}` };
  }
}

/**
 * Sync SimpleFIN accounts and create snapshots
 */
export async function syncSimpleFINAccounts(accessUrl?: string) {
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Retrieve accessUrl from credentials table if not provided
  if (!accessUrl) {
    const cred = db
      .select({ accessToken: credentials.accessToken })
      .from(credentials)
      .where(
        and(
          eq(credentials.userId, user.id),
          eq(credentials.provider, "SimpleFIN")
        )
      )
      .get();

    if (!cred?.accessToken) {
      return { error: "No SimpleFIN credentials found. Please reconnect your account." };
    }

    accessUrl = cred.accessToken;
  }

  try {
    // Fetch accounts from SimpleFIN (with transactions from last 90 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    let accountSet;
    try {
      accountSet = await fetchAccounts({ accessUrl }, { startDate });
    } catch (fetchError: unknown) {
      logger.error('simplefin', 'SimpleFIN fetch error', { error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
      const message = fetchError instanceof Error ? fetchError.message : "Unknown error";
      return { error: `Failed to fetch accounts: ${message}` };
    }

    if (accountSet.errors.length > 0) {
      logger.warn('simplefin', 'SimpleFIN returned errors', { errors: accountSet.errors });
    }

    // Transform accounts to our format
    const transformedAccounts = transformAccounts(accountSet.accounts, user.id);

    // Upsert accounts (update existing or insert new)
    for (let i = 0; i < transformedAccounts.length; i++) {
      const account = transformedAccounts[i];
      const simplefinAccount = accountSet.accounts[i];
      let accountId: string;

      // Check if account already exists
      const existingAccount = db
        .select({ id: accounts.id, balanceUsd: accounts.balanceUsd })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, user.id),
            eq(accounts.externalId, account.external_id ?? "")
          )
        )
        .get();

      if (existingAccount) {
        accountId = existingAccount.id;

        // Update existing account
        db.update(accounts)
          .set({
            balanceUsd: account.balance_usd,
            name: account.name,
            metadata: JSON.stringify(account.metadata),
            lastSyncedAt: account.last_synced_at,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(accounts.id, existingAccount.id))
          .run();

        // Create snapshot if balance changed
        if (existingAccount.balanceUsd !== account.balance_usd) {
          const snapshot = createSnapshot(existingAccount.id, account.balance_usd ?? 0);
          db.insert(snapshots)
            .values({
              id: generateIdFromEntropySize(10),
              accountId: snapshot.account_id,
              timestamp: snapshot.timestamp,
              valueUsd: snapshot.value_usd,
            })
            .run();
        }
      } else {
        // Insert new account
        accountId = generateIdFromEntropySize(10);
        db.insert(accounts)
          .values({
            id: accountId,
            userId: user.id,
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
        const snapshot = createSnapshot(accountId, account.balance_usd ?? 0);
        db.insert(snapshots)
          .values({
            id: generateIdFromEntropySize(10),
            accountId: snapshot.account_id,
            timestamp: snapshot.timestamp,
            valueUsd: snapshot.value_usd,
          })
          .run();
      }

      // Sync transactions for this account
      if (simplefinAccount.transactions && simplefinAccount.transactions.length > 0) {
        const txList = transformTransactions(simplefinAccount.transactions, accountId);

        // Upsert transactions
        for (const tx of txList) {
          // Check if transaction exists
          const existingTx = db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
              and(
                eq(transactions.accountId, accountId),
                eq(transactions.externalId, tx.external_id)
              )
            )
            .get();

          if (existingTx) {
            // Update existing transaction
            db.update(transactions)
              .set({
                postedAt: tx.posted_at,
                amount: tx.amount,
                description: tx.description,
                payee: tx.payee,
                memo: tx.memo,
                pending: tx.pending,
              })
              .where(eq(transactions.id, existingTx.id))
              .run();
          } else {
            // Insert new transaction
            db.insert(transactions)
              .values({
                id: generateIdFromEntropySize(10),
                accountId: tx.account_id,
                externalId: tx.external_id,
                postedAt: tx.posted_at,
                amount: tx.amount,
                description: tx.description,
                payee: tx.payee,
                memo: tx.memo,
                pending: tx.pending,
              })
              .run();
          }
        }
      }
    }

    revalidatePath("/dashboard");
    return { success: true, accountCount: transformedAccounts.length };
  } catch (error: unknown) {
    logger.error('simplefin', 'SimpleFIN sync error', { error: error instanceof Error ? error.message : String(error) });
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
  const { user } = await validateRequest();

  if (!user) {
    return { error: "Unauthorized", accounts: [] };
  }

  const userAccounts = db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, user.id),
        eq(accounts.provider, "SimpleFIN")
      )
    )
    .orderBy(accounts.name)
    .all();

  return { accounts: userAccounts };
}
