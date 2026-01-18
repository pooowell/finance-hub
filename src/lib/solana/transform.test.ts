import { describe, it, expect } from "vitest";
import { transformWalletToAccount, createWalletSnapshot } from "./transform";
import type { SolanaWalletData } from "@/types/solana";

describe("Solana Transform", () => {
  const mockUserId = "user-123";

  const mockWalletData: SolanaWalletData = {
    address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    solBalance: 5000000000, // 5 SOL in lamports
    solBalanceUi: 5,
    solPriceUsd: 100,
    solValueUsd: 500,
    tokens: [
      {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        balance: 1000000000,
        uiBalance: 1000,
        priceUsd: 1,
        valueUsd: 1000,
      },
    ],
    totalValueUsd: 1500,
    lastUpdated: new Date("2024-01-15T10:00:00Z"),
  };

  describe("transformWalletToAccount", () => {
    it("should transform wallet data to database account format", () => {
      const result = transformWalletToAccount(mockWalletData, mockUserId);

      expect(result.user_id).toBe(mockUserId);
      expect(result.provider).toBe("Solana");
      expect(result.type).toBe("crypto");
      expect(result.balance_usd).toBe(1500);
      expect(result.external_id).toBe(mockWalletData.address);
    });

    it("should create a formatted wallet name with address prefix/suffix", () => {
      const result = transformWalletToAccount(mockWalletData, mockUserId);

      expect(result.name).toContain("Solana Wallet");
      expect(result.name).toContain("7xKX");
      expect(result.name).toContain("AsU");
    });

    it("should include SOL balance and price in metadata", () => {
      const result = transformWalletToAccount(mockWalletData, mockUserId);

      expect(result.metadata).toHaveProperty("sol_balance", 5);
      expect(result.metadata).toHaveProperty("sol_price_usd", 100);
      expect(result.metadata).toHaveProperty("sol_value_usd", 500);
    });

    it("should include token count in metadata", () => {
      const result = transformWalletToAccount(mockWalletData, mockUserId);

      expect(result.metadata).toHaveProperty("token_count", 1);
    });

    it("should include token details in metadata", () => {
      const result = transformWalletToAccount(mockWalletData, mockUserId);
      const metadata = result.metadata as Record<string, unknown>;
      const tokens = metadata.tokens as Array<{
        mint: string;
        symbol: string;
        balance: number;
        value_usd: number | null;
      }>;

      expect(tokens).toHaveLength(1);
      expect(tokens[0].symbol).toBe("USDC");
      expect(tokens[0].balance).toBe(1000);
      expect(tokens[0].value_usd).toBe(1000);
    });

    it("should set last_synced_at from wallet lastUpdated", () => {
      const result = transformWalletToAccount(mockWalletData, mockUserId);

      expect(result.last_synced_at).toBe(mockWalletData.lastUpdated.toISOString());
    });

    it("should handle wallet with no tokens", () => {
      const walletWithNoTokens: SolanaWalletData = {
        ...mockWalletData,
        tokens: [],
        totalValueUsd: 500,
      };

      const result = transformWalletToAccount(walletWithNoTokens, mockUserId);

      expect(result.balance_usd).toBe(500);
      expect(result.metadata).toHaveProperty("token_count", 0);
    });

    it("should handle null SOL price", () => {
      const walletWithNullPrice: SolanaWalletData = {
        ...mockWalletData,
        solPriceUsd: null,
        solValueUsd: null,
        totalValueUsd: 1000, // Only token value
      };

      const result = transformWalletToAccount(walletWithNullPrice, mockUserId);

      expect(result.metadata).toHaveProperty("sol_price_usd", null);
      expect(result.metadata).toHaveProperty("sol_value_usd", null);
    });
  });

  describe("createWalletSnapshot", () => {
    it("should create a snapshot with account ID and total value", () => {
      const accountId = "account-123";
      const totalValue = 1500;

      const result = createWalletSnapshot(accountId, totalValue);

      expect(result.account_id).toBe(accountId);
      expect(result.value_usd).toBe(totalValue);
      expect(result.timestamp).toBeDefined();
    });

    it("should use provided timestamp when given", () => {
      const timestamp = new Date("2024-01-15T10:00:00Z");
      const result = createWalletSnapshot("account-123", 1000, timestamp);

      expect(result.timestamp).toBe(timestamp.toISOString());
    });

    it("should use current time when timestamp not provided", () => {
      const before = new Date();
      const result = createWalletSnapshot("account-123", 1000);
      const after = new Date();

      const resultTime = new Date(result.timestamp!).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before.getTime());
      expect(resultTime).toBeLessThanOrEqual(after.getTime());
    });

    it("should handle zero balance", () => {
      const result = createWalletSnapshot("account-123", 0);

      expect(result.value_usd).toBe(0);
    });
  });
});
