/**
 * Transform Solana wallet data to database schema
 */

import type { SolanaWalletData } from "@/types/solana";

// Types matching what server actions expect (snake_case)
export interface AccountInsert {
  user_id: string;
  provider: string;
  name: string;
  type: string;
  balance_usd: number | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: string | null;
}

export interface SnapshotInsert {
  account_id: string;
  value_usd: number;
  timestamp: string;
}

/**
 * Transforms Solana wallet data to our database account format
 */
export function transformWalletToAccount(
  walletData: SolanaWalletData,
  userId: string
): AccountInsert {
  return {
    user_id: userId,
    provider: "Solana",
    name: `Solana Wallet (${walletData.address.slice(0, 4)}...${walletData.address.slice(-4)})`,
    type: "crypto",
    balance_usd: walletData.totalValueUsd,
    external_id: walletData.address,
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
    last_synced_at: walletData.lastUpdated.toISOString(),
  };
}

/**
 * Creates a snapshot from wallet data
 */
export function createWalletSnapshot(
  accountId: string,
  totalValueUsd: number,
  timestamp?: Date
): SnapshotInsert {
  return {
    account_id: accountId,
    value_usd: totalValueUsd,
    timestamp: (timestamp ?? new Date()).toISOString(),
  };
}
