/**
 * Solana Wallet Service
 * Fetches SOL and SPL token balances using @solana/web3.js
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { SolanaTokenBalance, SolanaWalletData } from "@/types/solana";
import { KNOWN_TOKENS } from "@/types/solana";
import { getTokenPrices, getSolPrice } from "./prices";

// Default to public Solana mainnet RPC, can be overridden with env var
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/**
 * Creates a Solana connection
 */
export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

/**
 * Validates a Solana wallet address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches SOL balance for a wallet
 */
export async function getSolBalance(
  connection: Connection,
  walletAddress: string
): Promise<{ lamports: number; sol: number }> {
  const publicKey = new PublicKey(walletAddress);
  const lamports = await connection.getBalance(publicKey);
  return {
    lamports,
    sol: lamports / LAMPORTS_PER_SOL,
  };
}

/**
 * Fetches all SPL token accounts for a wallet
 */
export async function getTokenAccounts(
  connection: Connection,
  walletAddress: string
): Promise<SolanaTokenBalance[]> {
  const publicKey = new PublicKey(walletAddress);

  // Get all token accounts owned by this wallet
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
    programId: TOKEN_PROGRAM_ID,
  });

  const tokens: SolanaTokenBalance[] = [];

  for (const { account } of tokenAccounts.value) {
    const parsedInfo = account.data.parsed.info;
    const mint = parsedInfo.mint;
    const balance = parsedInfo.tokenAmount.amount;
    const decimals = parsedInfo.tokenAmount.decimals;
    const uiBalance = parsedInfo.tokenAmount.uiAmount || 0;

    // Skip zero balances
    if (uiBalance === 0) continue;

    // Get token metadata from known tokens or use defaults
    const knownToken = KNOWN_TOKENS[mint];

    tokens.push({
      mint,
      symbol: knownToken?.symbol || "UNKNOWN",
      name: knownToken?.name || "Unknown Token",
      decimals,
      balance: parseInt(balance),
      uiBalance,
      priceUsd: null, // Will be filled in by price service
      valueUsd: null,
    });
  }

  return tokens;
}

/**
 * Fetches complete wallet data including SOL, tokens, and USD values
 */
export async function getWalletData(walletAddress: string): Promise<SolanaWalletData> {
  const connection = getConnection();

  // Fetch SOL balance and token accounts in parallel
  const [solBalanceData, tokenAccounts] = await Promise.all([
    getSolBalance(connection, walletAddress),
    getTokenAccounts(connection, walletAddress),
  ]);

  // Get mint addresses for price lookup
  const mintAddresses = tokenAccounts.map((t) => t.mint);

  // Fetch prices in parallel
  const [solPrice, tokenPrices] = await Promise.all([
    getSolPrice(),
    getTokenPrices(mintAddresses),
  ]);

  // Calculate SOL value
  const solValueUsd = solPrice ? solBalanceData.sol * solPrice : null;

  // Enrich tokens with prices
  const enrichedTokens = tokenAccounts.map((token) => {
    const price = tokenPrices[token.mint] || null;
    return {
      ...token,
      priceUsd: price,
      valueUsd: price ? token.uiBalance * price : null,
    };
  });

  // Calculate total value
  let totalValueUsd = solValueUsd || 0;
  for (const token of enrichedTokens) {
    if (token.valueUsd) {
      totalValueUsd += token.valueUsd;
    }
  }

  return {
    address: walletAddress,
    solBalance: solBalanceData.lamports,
    solBalanceUi: solBalanceData.sol,
    solPriceUsd: solPrice,
    solValueUsd,
    tokens: enrichedTokens,
    totalValueUsd,
    lastUpdated: new Date(),
  };
}

/**
 * Fetches wallet data for multiple addresses
 */
export async function getMultipleWalletData(
  walletAddresses: string[]
): Promise<SolanaWalletData[]> {
  const results = await Promise.all(
    walletAddresses.map((address) => getWalletData(address))
  );
  return results;
}
