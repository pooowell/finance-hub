import { describe, it, expect, vi, beforeEach } from "vitest";
import { getJupiterPrices, getSolPrice } from "./prices";

// Mock the logger module
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";

const mockedLogger = vi.mocked(logger);

beforeEach(() => {
  vi.restoreAllMocks();
  // Re-mock logger after restoreAllMocks clears mocks
  mockedLogger.error = vi.fn();
  global.fetch = vi.fn();
});

describe("prices.ts - structured logging", () => {
  it("should not contain any console.error calls", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "prices.ts"),
      "utf-8"
    );
    expect(source).not.toContain("console.error");
  });

  it("logs structured error on Jupiter API non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    const result = await getJupiterPrices(["So11111111111111111111111111111111"]);

    expect(result).toEqual({});
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "prices",
      "Jupiter API error",
      { status: 503, statusText: "Service Unavailable" }
    );
  });

  it("logs structured error on Jupiter fetch exception", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network timeout"));

    const result = await getJupiterPrices(["So11111111111111111111111111111111"]);

    expect(result).toEqual({});
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "prices",
      "Failed to fetch Jupiter prices",
      { error: "Network timeout" }
    );
  });

  it("logs structured error on CoinGecko API non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    const result = await getSolPrice();

    expect(result).toBeNull();
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "prices",
      "CoinGecko API error",
      { status: 429, statusText: "Too Many Requests" }
    );
  });

  it("logs structured error on CoinGecko fetch exception", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("DNS failure"));

    const result = await getSolPrice();

    expect(result).toBeNull();
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "prices",
      "Failed to fetch SOL price",
      { error: "DNS failure" }
    );
  });

  it("stringifies non-Error exceptions in Jupiter catch", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce("raw string error");

    const result = await getJupiterPrices(["mint1"]);

    expect(result).toEqual({});
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "prices",
      "Failed to fetch Jupiter prices",
      { error: "raw string error" }
    );
  });
});
