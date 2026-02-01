import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock functions (available in vi.mock factories)
// ---------------------------------------------------------------------------
const { mockGetBalance, mockGetParsedTokenAccountsByOwner } = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockGetParsedTokenAccountsByOwner: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @solana/web3.js
// ---------------------------------------------------------------------------
vi.mock("@solana/web3.js", () => {
  const validAddresses = new Set([
    "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "So11111111111111111111111111111111111111112",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "addr1aaaabbbbccccddddeeeeffffgggghhhh",
    "addr2aaaabbbbccccddddeeeeffffgggghhhh",
    "addr3aaaabbbbccccddddeeeeffffgggghhhh",
  ]);

  class MockPublicKey {
    private address: string;

    constructor(address: string) {
      if (!address || typeof address !== "string") {
        throw new Error("Invalid public key input");
      }
      if (/[0OIl]/.test(address)) {
        throw new Error("Invalid public key input");
      }
      if (address.length < 32 || address.length > 44) {
        throw new Error("Invalid public key input");
      }
      if (!validAddresses.has(address) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        throw new Error("Invalid public key input");
      }
      this.address = address;
    }

    toBase58() {
      return this.address;
    }
  }

  return {
    Connection: vi.fn().mockImplementation(function () {
      return {
        getBalance: mockGetBalance,
        getParsedTokenAccountsByOwner: mockGetParsedTokenAccountsByOwner,
      };
    }),
    PublicKey: MockPublicKey,
    LAMPORTS_PER_SOL: 1_000_000_000,
  };
});

vi.mock("@solana/spl-token", () => ({
  TOKEN_PROGRAM_ID: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
}));

vi.mock("./prices", () => ({
  getSolPrice: vi.fn().mockResolvedValue(100),
  getTokenPrices: vi.fn().mockResolvedValue({}),
}));

// Mock retry to run immediately (no delays in tests)
vi.mock("./retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./retry")>();
  return {
    ...actual,
    withRetry: async <T>(fn: () => Promise<T>, options?: { maxAttempts?: number }) => {
      const maxAttempts = options?.maxAttempts ?? 3;
      let lastError: Error | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (!actual.isTransientError(error)) {
            throw lastError;
          }
        }
      }
      throw lastError!;
    },
  };
});

// Import after mocks are set up
import {
  isValidSolanaAddress,
  getSolBalance,
  getTokenAccounts,
  getMultipleWalletData,
  getConnection,
} from "./client";
import { SolanaInvalidAddressError } from "./retry";

const VALID_ADDR = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("Solana Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBalance.mockResolvedValue(5000000000);
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({ value: [] });
  });

  // =========================================================================
  // isValidSolanaAddress
  // =========================================================================
  describe("isValidSolanaAddress", () => {
    it("should return true for valid Solana addresses", () => {
      const validAddresses = [
        "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      ];

      for (const address of validAddresses) {
        expect(isValidSolanaAddress(address)).toBe(true);
      }
    });

    it("should return false for invalid addresses", () => {
      const invalidAddresses = [
        "",
        "not-a-valid-address",
        "0x742d35Cc6634C0532925a3b844Bc9e7595f",
        "12345",
        "invalid",
      ];

      for (const address of invalidAddresses) {
        expect(isValidSolanaAddress(address)).toBe(false);
      }
    });

    it("should return false for addresses with invalid base58 characters", () => {
      const invalidAddresses = [
        "0xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "OxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "IxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "lxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      ];

      for (const address of invalidAddresses) {
        expect(isValidSolanaAddress(address)).toBe(false);
      }
    });

    it("should return false for null and undefined", () => {
      // @ts-expect-error testing invalid input
      expect(isValidSolanaAddress(null)).toBe(false);
      // @ts-expect-error testing invalid input
      expect(isValidSolanaAddress(undefined)).toBe(false);
    });
  });

  // =========================================================================
  // getSolBalance — retry behavior
  // =========================================================================
  describe("getSolBalance", () => {
    it("retries on transient RPC errors and succeeds", async () => {
      mockGetBalance
        .mockRejectedValueOnce(new Error("503 Service Unavailable"))
        .mockResolvedValueOnce(3000000000);

      const connection = getConnection();
      const result = await getSolBalance(connection, VALID_ADDR);

      expect(result).toEqual({ lamports: 3000000000, sol: 3 });
      expect(mockGetBalance).toHaveBeenCalledTimes(2);
    });

    it("throws SolanaInvalidAddressError for bad addresses without retrying", async () => {
      const connection = getConnection();
      await expect(
        getSolBalance(connection, "bad")
      ).rejects.toThrow(SolanaInvalidAddressError);
      expect(mockGetBalance).not.toHaveBeenCalled();
    });

    it("does not retry permanent errors from RPC", async () => {
      mockGetBalance.mockRejectedValue(new Error("Invalid params"));

      const connection = getConnection();
      await expect(
        getSolBalance(connection, VALID_ADDR)
      ).rejects.toThrow("Invalid params");
      expect(mockGetBalance).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // getTokenAccounts — retry behavior
  // =========================================================================
  describe("getTokenAccounts", () => {
    it("retries on transient errors", async () => {
      mockGetParsedTokenAccountsByOwner
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce({ value: [] });

      const connection = getConnection();
      const result = await getTokenAccounts(connection, VALID_ADDR);

      expect(result).toEqual([]);
      expect(mockGetParsedTokenAccountsByOwner).toHaveBeenCalledTimes(2);
    });

    it("throws SolanaInvalidAddressError for bad addresses", async () => {
      const connection = getConnection();
      await expect(
        getTokenAccounts(connection, "bad")
      ).rejects.toThrow(SolanaInvalidAddressError);
      expect(mockGetParsedTokenAccountsByOwner).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getMultipleWalletData — partial failures
  // =========================================================================
  describe("getMultipleWalletData", () => {
    it("returns successful data for all wallets", async () => {
      const results = await getMultipleWalletData([VALID_ADDR]);

      expect(results).toHaveLength(1);
      expect(results[0].address).toBe(VALID_ADDR);
      expect(results[0].data).toBeDefined();
      expect(results[0].error).toBeUndefined();
    });

    it("returns partial results when some wallets fail", async () => {
      let callCount = 0;
      mockGetBalance.mockImplementation(() => {
        callCount++;
        // First call succeeds (wallet 1), subsequent calls fail (wallet 2 retries)
        if (callCount <= 1) {
          return Promise.resolve(5000000000);
        }
        return Promise.reject(new Error("timeout"));
      });

      const addr1 = "addr1aaaabbbbccccddddeeeeffffgggghhhh";
      const addr2 = "addr2aaaabbbbccccddddeeeeffffgggghhhh";
      const results = await getMultipleWalletData([addr1, addr2]);

      expect(results).toHaveLength(2);

      // First wallet should succeed
      expect(results[0].address).toBe(addr1);
      expect(results[0].data).toBeDefined();
      expect(results[0].error).toBeUndefined();

      // Second wallet should have error
      expect(results[1].address).toBe(addr2);
      expect(results[1].data).toBeUndefined();
      expect(results[1].error).toBeDefined();
      expect(results[1].error).toContain("timeout");
    });

    it("handles all wallets failing gracefully", async () => {
      mockGetBalance.mockRejectedValue(new Error("503 Service Unavailable"));

      const addr1 = "addr1aaaabbbbccccddddeeeeffffgggghhhh";
      const addr2 = "addr2aaaabbbbccccddddeeeeffffgggghhhh";
      const results = await getMultipleWalletData([addr1, addr2]);

      expect(results).toHaveLength(2);
      expect(results[0].error).toBeDefined();
      expect(results[1].error).toBeDefined();
      expect(results[0].data).toBeUndefined();
      expect(results[1].data).toBeUndefined();
    });

    it("returns empty array for empty input", async () => {
      const results = await getMultipleWalletData([]);
      expect(results).toEqual([]);
    });

    it("includes invalid address errors in results", async () => {
      const results = await getMultipleWalletData(["bad"]);

      expect(results).toHaveLength(1);
      expect(results[0].address).toBe("bad");
      expect(results[0].data).toBeUndefined();
      expect(results[0].error).toContain("Invalid Solana address");
    });
  });
});
