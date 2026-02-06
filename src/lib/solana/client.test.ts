import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock @solana/web3.js before importing the client
vi.mock("@solana/web3.js", () => {
  const validAddresses = new Set([
    "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "So11111111111111111111111111111111111111112",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  ]);

  class MockPublicKey {
    private address: string;

    constructor(address: string) {
      // Simulate base58 validation
      if (!address || typeof address !== "string") {
        throw new Error("Invalid public key input");
      }

      // Check for invalid base58 characters (0, O, I, l are not valid)
      if (/[0OIl]/.test(address)) {
        throw new Error("Invalid public key input");
      }

      // Basic length check (Solana addresses are 32-44 characters)
      if (address.length < 32 || address.length > 44) {
        throw new Error("Invalid public key input");
      }

      // Check if it's a known valid address or passes basic validation
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
    Connection: vi.fn().mockImplementation(() => ({
      getBalance: vi.fn().mockResolvedValue(5000000000),
      getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({ value: [] }),
    })),
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

// Import after mocks are set up
import { isValidSolanaAddress } from "./client";

describe("Solana Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
        "", // empty
        "not-a-valid-address", // too short
        "0x742d35Cc6634C0532925a3b844Bc9e7595f", // Ethereum-style address
        "12345", // too short
        "invalid", // too short
      ];

      for (const address of invalidAddresses) {
        expect(isValidSolanaAddress(address)).toBe(false);
      }
    });

    it("should return false for addresses with invalid base58 characters", () => {
      // Solana addresses use base58, which excludes 0, O, I, l
      const invalidAddresses = [
        "0xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", // contains 0
        "OxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", // contains O
        "IxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", // contains I
        "lxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", // contains l
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
});
