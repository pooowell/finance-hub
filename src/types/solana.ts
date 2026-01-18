/**
 * Solana Wallet Types
 */

export interface SolanaTokenBalance {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number; // Raw balance (before decimals)
  uiBalance: number; // Human-readable balance
  priceUsd: number | null;
  valueUsd: number | null;
  logoUri?: string;
}

export interface SolanaWalletData {
  address: string;
  solBalance: number; // SOL balance in lamports
  solBalanceUi: number; // SOL balance in SOL
  solPriceUsd: number | null;
  solValueUsd: number | null;
  tokens: SolanaTokenBalance[];
  totalValueUsd: number;
  lastUpdated: Date;
}

export interface TokenPrice {
  id: string;
  mintSymbol: string;
  vsToken: string;
  vsTokenSymbol: string;
  price: number;
}

export interface JupiterPriceResponse {
  data: Record<string, TokenPrice>;
  timeTaken: number;
}

export interface CoinGeckoPriceResponse {
  [id: string]: {
    usd: number;
  };
}

/**
 * Known SPL token metadata
 */
export const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number; coingeckoId?: string }> = {
  // Native SOL (wrapped)
  "So11111111111111111111111111111111111111112": {
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    coingeckoId: "solana",
  },
  // USDC
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  // USDT
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    coingeckoId: "tether",
  },
  // Bonk
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    coingeckoId: "bonk",
  },
  // JTO
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": {
    symbol: "JTO",
    name: "Jito",
    decimals: 9,
    coingeckoId: "jito-governance-token",
  },
  // JUP
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": {
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    coingeckoId: "jupiter-exchange-solana",
  },
  // RAY
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    symbol: "RAY",
    name: "Raydium",
    decimals: 6,
    coingeckoId: "raydium",
  },
};

/**
 * SOL mint address constant
 */
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const LAMPORTS_PER_SOL = 1_000_000_000;
