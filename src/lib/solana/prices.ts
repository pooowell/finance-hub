/**
 * Price Feed Service
 * Integrates Jupiter and CoinGecko for token price data
 */

import type { JupiterPriceResponse } from "@/types/solana";
import { SOL_MINT } from "@/types/solana";
import { logger } from "@/lib/logger";

const JUPITER_PRICE_API = "https://price.jup.ag/v6/price";
const COINGECKO_API = "https://api.coingecko.com/api/v3";

/**
 * Fetches token prices from Jupiter Price API
 * Jupiter provides real-time prices for Solana tokens
 */
export async function getJupiterPrices(
  mintAddresses: string[]
): Promise<Record<string, number>> {
  if (mintAddresses.length === 0) return {};

  try {
    const ids = mintAddresses.join(",");
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      logger.error("prices", "Jupiter API error", { status: response.status, statusText: response.statusText });
      return {};
    }

    const data: JupiterPriceResponse = await response.json();

    const prices: Record<string, number> = {};
    for (const [mint, priceData] of Object.entries(data.data)) {
      if (priceData?.price) {
        prices[mint] = priceData.price;
      }
    }

    return prices;
  } catch (error) {
    logger.error("prices", "Failed to fetch Jupiter prices", { error: error instanceof Error ? error.message : String(error) });
    return {};
  }
}

/**
 * Fetches SOL price from CoinGecko
 */
export async function getSolPrice(): Promise<number | null> {
  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=solana&vs_currencies=usd`,
      {
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) {
      logger.error("prices", "CoinGecko API error", { status: response.status, statusText: response.statusText });
      return null;
    }

    const data = await response.json();
    return data.solana?.usd ?? null;
  } catch (error) {
    logger.error("prices", "Failed to fetch SOL price", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Fetches prices for multiple tokens
 * First tries Jupiter, falls back to including in known token lookups
 */
export async function getTokenPrices(
  mintAddresses: string[]
): Promise<Record<string, number>> {
  // Filter out SOL mint as we handle it separately
  const tokenMints = mintAddresses.filter((m) => m !== SOL_MINT);

  if (tokenMints.length === 0) return {};

  // Try Jupiter first for all tokens
  const jupiterPrices = await getJupiterPrices(tokenMints);

  return jupiterPrices;
}

/**
 * Gets a formatted USD value string
 */
export function formatUsdValue(value: number | null): string {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Gets a formatted token balance string
 */
export function formatTokenBalance(balance: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(balance);
}
