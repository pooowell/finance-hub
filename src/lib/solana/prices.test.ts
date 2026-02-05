import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithRetry before importing prices module
vi.mock("@/lib/utils/fetch-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

import { getJupiterPrices, getSolPrice, formatUsdValue, formatTokenBalance } from "./prices";
import { fetchWithRetry } from "@/lib/utils/fetch-retry";

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getJupiterPrices", () => {
  it("returns empty object for empty mint list", async () => {
    const result = await getJupiterPrices([]);
    expect(result).toEqual({});
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it("returns prices from Jupiter API", async () => {
    const jupiterResponse = {
      data: {
        "So11111111111111111111111111111111111111112": { price: 175.42 },
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { price: 1.0 },
      },
    };

    mockFetchWithRetry.mockResolvedValue(jsonResponse(jupiterResponse));

    const result = await getJupiterPrices([
      "So11111111111111111111111111111111111111112",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    ]);

    expect(result).toEqual({
      "So11111111111111111111111111111111111111112": 175.42,
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 1.0,
    });

    // Verify fetchWithRetry was called with the right URL and label
    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      expect.stringContaining("price.jup.ag"),
      expect.any(Object),
      expect.objectContaining({ label: "Jupiter Price API" })
    );
  });

  it("returns empty object on non-OK response", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchWithRetry.mockResolvedValue(jsonResponse({}, 400));

    const result = await getJupiterPrices(["So11111111111111111111111111111111111111112"]);
    expect(result).toEqual({});
    expect(errorSpy).toHaveBeenCalledWith("Jupiter API error:", expect.any(String));
  });

  it("returns empty object on fetch exception", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchWithRetry.mockRejectedValue(new TypeError("Network error"));

    const result = await getJupiterPrices(["So11111111111111111111111111111111111111112"]);
    expect(result).toEqual({});
    expect(errorSpy).toHaveBeenCalledWith("Failed to fetch Jupiter prices:", expect.any(TypeError));
  });

  it("skips tokens with null/undefined price", async () => {
    const jupiterResponse = {
      data: {
        "mint1": { price: 10 },
        "mint2": { price: null },
        "mint3": {},
      },
    };
    mockFetchWithRetry.mockResolvedValue(jsonResponse(jupiterResponse));

    const result = await getJupiterPrices(["mint1", "mint2", "mint3"]);
    expect(result).toEqual({ mint1: 10 });
  });
});

describe("getSolPrice", () => {
  it("returns SOL price from CoinGecko", async () => {
    mockFetchWithRetry.mockResolvedValue(
      jsonResponse({ solana: { usd: 178.55 } })
    );

    const result = await getSolPrice();
    expect(result).toBe(178.55);

    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      expect.stringContaining("coingecko.com"),
      expect.any(Object),
      expect.objectContaining({ label: "CoinGecko SOL Price" })
    );
  });

  it("returns null on non-OK response", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchWithRetry.mockResolvedValue(jsonResponse({}, 403));

    const result = await getSolPrice();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns null on exception", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchWithRetry.mockRejectedValue(new Error("timeout"));

    const result = await getSolPrice();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("Failed to fetch SOL price:", expect.any(Error));
  });

  it("returns null when solana.usd is missing", async () => {
    mockFetchWithRetry.mockResolvedValue(jsonResponse({}));

    const result = await getSolPrice();
    expect(result).toBeNull();
  });
});

describe("formatUsdValue", () => {
  it("formats a dollar amount", () => {
    expect(formatUsdValue(1234.5)).toBe("$1,234.50");
  });

  it("returns N/A for null", () => {
    expect(formatUsdValue(null)).toBe("N/A");
  });
});

describe("formatTokenBalance", () => {
  it("formats with default decimals", () => {
    expect(formatTokenBalance(12345.678)).toBe("12,345.68");
  });

  it("formats with custom decimals", () => {
    expect(formatTokenBalance(1.123456789, 6)).toBe("1.123457");
  });
});
