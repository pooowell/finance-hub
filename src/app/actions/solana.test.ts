import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Proxy-based db mock (queue pattern) — mirrors project convention
// ---------------------------------------------------------------------------
const { dbQueue, mockDb } = vi.hoisted(() => {
  const dbQueue: Array<unknown> = [];

  // A recursive proxy that captures any chained method call and returns itself,
  // except for terminal methods (.get / .all / .run) which shift from the queue.
  const createChain = (): unknown =>
    new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === "get" || prop === "all" || prop === "run") {
          return () => dbQueue.shift();
        }
        return createChain();
      },
      apply() {
        return createChain();
      },
    });

  const mockDb = createChain();
  return { dbQueue, mockDb };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/db", () => ({
  db: mockDb,
  accounts: { id: "id", userId: "user_id", externalId: "external_id", provider: "provider", name: "name", balanceUsd: "balance_usd" },
  snapshots: { id: "id", accountId: "account_id" },
}));

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(),
}));

vi.mock("lucia", () => ({
  generateIdFromEntropySize: vi.fn(),
}));

vi.mock("@/lib/solana", () => ({
  getWalletData: vi.fn(),
  isValidSolanaAddress: vi.fn(),
  transformWalletToAccount: vi.fn(),
  createWalletSnapshot: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (must come after vi.mock calls)
// ---------------------------------------------------------------------------
import {
  connectSolanaWallet,
  syncSolanaWallets,
  removeSolanaWallet,
  getSolanaWallets,
} from "./solana";

import { validateRequest } from "@/lib/auth";
import { generateIdFromEntropySize } from "lucia";
import {
  getWalletData,
  isValidSolanaAddress,
  transformWalletToAccount,
  createWalletSnapshot,
} from "@/lib/solana";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_USER = { id: "user-1", email: "test@example.com" };

function authed() {
  vi.mocked(validateRequest).mockResolvedValue({
    user: MOCK_USER,
    session: { id: "sess-1", userId: MOCK_USER.id, expiresAt: Date.now() },
  } as never);
}

function unauthed() {
  vi.mocked(validateRequest).mockResolvedValue({
    user: null,
    session: null,
  } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Solana server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQueue.length = 0;
  });

  // =========================================================================
  // connectSolanaWallet
  // =========================================================================
  describe("connectSolanaWallet", () => {
    it("returns Unauthorized when not logged in", async () => {
      unauthed();
      const result = await connectSolanaWallet("anything");
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("returns error for invalid wallet address", async () => {
      authed();
      vi.mocked(isValidSolanaAddress).mockReturnValue(false);

      const result = await connectSolanaWallet("bad-address");
      expect(result).toEqual({ error: "Invalid Solana wallet address" });
      expect(isValidSolanaAddress).toHaveBeenCalledWith("bad-address");
    });

    it("returns error when wallet is already connected", async () => {
      authed();
      vi.mocked(isValidSolanaAddress).mockReturnValue(true);
      // db.select().from().where().get() → returns existing account
      dbQueue.push({ id: "existing-acc" });

      const result = await connectSolanaWallet("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
      expect(result).toEqual({ error: "Wallet already connected" });
    });

    it("connects wallet successfully", async () => {
      authed();
      vi.mocked(isValidSolanaAddress).mockReturnValue(true);
      // no existing account
      dbQueue.push(undefined);

      const walletData = {
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        solBalance: 5000000000,
        solBalanceUi: 5,
        solPriceUsd: 100,
        solValueUsd: 500,
        tokens: [{ mint: "USDC", symbol: "USDC", name: "USD Coin", decimals: 6, balance: 1e9, uiBalance: 1000, priceUsd: 1, valueUsd: 1000 }],
        totalValueUsd: 1500,
        lastUpdated: new Date(),
      };
      vi.mocked(getWalletData).mockResolvedValue(walletData);

      vi.mocked(transformWalletToAccount).mockReturnValue({
        user_id: MOCK_USER.id,
        provider: "Solana",
        name: "Solana Wallet (7xKX...AsU)",
        type: "crypto",
        balance_usd: 1500,
        external_id: walletData.address,
        metadata: {},
        last_synced_at: walletData.lastUpdated.toISOString(),
      });

      vi.mocked(generateIdFromEntropySize)
        .mockReturnValueOnce("acc-id-1")   // account id
        .mockReturnValueOnce("snap-id-1"); // snapshot id

      vi.mocked(createWalletSnapshot).mockReturnValue({
        account_id: "acc-id-1",
        value_usd: 1500,
        timestamp: new Date().toISOString(),
      });

      // insert account .run(), insert snapshot .run()
      dbQueue.push(undefined);
      dbQueue.push(undefined);

      const result = await connectSolanaWallet(walletData.address);

      expect(result).toEqual({
        success: true,
        totalValueUsd: 1500,
        tokenCount: 1,
      });
      expect(getWalletData).toHaveBeenCalledWith(walletData.address);
      expect(transformWalletToAccount).toHaveBeenCalledWith(walletData, MOCK_USER.id);
      expect(createWalletSnapshot).toHaveBeenCalledWith("acc-id-1", 1500);
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("returns error when getWalletData throws", async () => {
      authed();
      vi.mocked(isValidSolanaAddress).mockReturnValue(true);
      dbQueue.push(undefined); // no existing account

      vi.mocked(getWalletData).mockRejectedValue(new Error("RPC timeout"));

      const result = await connectSolanaWallet("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
      expect(result).toEqual({ error: "Failed to fetch wallet data" });
    });
  });

  // =========================================================================
  // syncSolanaWallets
  // =========================================================================
  describe("syncSolanaWallets", () => {
    it("returns Unauthorized when not logged in", async () => {
      unauthed();
      const result = await syncSolanaWallets();
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("returns synced 0 when user has no Solana accounts", async () => {
      authed();
      // db.select().from().where().all() → empty array
      dbQueue.push([]);

      const result = await syncSolanaWallets();
      expect(result).toEqual({ success: true, synced: 0 });
    });

    it("syncs accounts and creates snapshot when balance changes", async () => {
      authed();
      const existingAccounts = [
        { id: "acc-1", externalId: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", balanceUsd: 1000 },
      ];
      dbQueue.push(existingAccounts);

      const freshData = {
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        solBalance: 5e9,
        solBalanceUi: 5,
        solPriceUsd: 120,
        solValueUsd: 600,
        tokens: [],
        totalValueUsd: 1500, // changed from 1000
        lastUpdated: new Date(),
      };
      vi.mocked(getWalletData).mockResolvedValue(freshData);

      vi.mocked(createWalletSnapshot).mockReturnValue({
        account_id: "acc-1",
        value_usd: 1500,
        timestamp: new Date().toISOString(),
      });

      vi.mocked(generateIdFromEntropySize).mockReturnValue("snap-new");

      // update .run(), insert snapshot .run()
      dbQueue.push(undefined);
      dbQueue.push(undefined);

      const result = await syncSolanaWallets();

      expect(result).toEqual({ success: true, synced: 1 });
      expect(getWalletData).toHaveBeenCalledWith(existingAccounts[0].externalId);
      expect(createWalletSnapshot).toHaveBeenCalledWith("acc-1", 1500);
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("skips snapshot when balance unchanged", async () => {
      authed();
      const existingAccounts = [
        { id: "acc-1", externalId: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", balanceUsd: 1500 },
      ];
      dbQueue.push(existingAccounts);

      vi.mocked(getWalletData).mockResolvedValue({
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        solBalance: 5e9,
        solBalanceUi: 5,
        solPriceUsd: 120,
        solValueUsd: 600,
        tokens: [],
        totalValueUsd: 1500, // same as existing
        lastUpdated: new Date(),
      });

      // update .run() only, no snapshot insert
      dbQueue.push(undefined);

      const result = await syncSolanaWallets();

      expect(result).toEqual({ success: true, synced: 1 });
      expect(createWalletSnapshot).not.toHaveBeenCalled();
    });

    it("skips accounts with null externalId", async () => {
      authed();
      dbQueue.push([
        { id: "acc-1", externalId: null, balanceUsd: 100 },
      ]);

      const result = await syncSolanaWallets();

      expect(result).toEqual({ success: true, synced: 0 });
      expect(getWalletData).not.toHaveBeenCalled();
    });

    it("continues syncing when one wallet fails", async () => {
      authed();
      dbQueue.push([
        { id: "acc-1", externalId: "addr1", balanceUsd: 100 },
        { id: "acc-2", externalId: "addr2", balanceUsd: 200 },
      ]);

      vi.mocked(getWalletData)
        .mockRejectedValueOnce(new Error("RPC fail"))
        .mockResolvedValueOnce({
          address: "addr2",
          solBalance: 1e9,
          solBalanceUi: 1,
          solPriceUsd: 100,
          solValueUsd: 100,
          tokens: [],
          totalValueUsd: 200,
          lastUpdated: new Date(),
        });

      // update .run() for the second account
      dbQueue.push(undefined);

      const result = await syncSolanaWallets();

      // Only second wallet succeeded
      expect(result).toEqual({ success: true, synced: 1 });
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("returns error when outer try/catch triggers", async () => {
      authed();
      // Force the .all() call to throw by pushing nothing and making the proxy
      // chain throw. We'll mock validateRequest to throw from within.
      vi.mocked(validateRequest).mockResolvedValue({
        user: MOCK_USER,
        session: { id: "s", userId: MOCK_USER.id, expiresAt: Date.now() },
      } as never);

      // Simulate db throwing on the select chain — push a value that will
      // make code blow up when it tries to read .length
      dbQueue.push(null); // .all() returns null → `.length` throws

      const result = await syncSolanaWallets();
      expect(result).toEqual({ error: "Failed to sync wallets" });
    });
  });

  // =========================================================================
  // removeSolanaWallet
  // =========================================================================
  describe("removeSolanaWallet", () => {
    it("returns Unauthorized when not logged in", async () => {
      unauthed();
      const result = await removeSolanaWallet("acc-1");
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("removes wallet successfully", async () => {
      authed();
      // db.delete().where().run() → { changes: 1 }
      dbQueue.push({ changes: 1 });

      const result = await removeSolanaWallet("acc-1");
      expect(result).toEqual({ success: true });
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("returns error when wallet not found or not owned", async () => {
      authed();
      dbQueue.push({ changes: 0 });

      const result = await removeSolanaWallet("nonexistent");
      expect(result).toEqual({ error: "Failed to remove wallet" });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getSolanaWallets
  // =========================================================================
  describe("getSolanaWallets", () => {
    it("returns Unauthorized with empty accounts when not logged in", async () => {
      unauthed();
      const result = await getSolanaWallets();
      expect(result).toEqual({ error: "Unauthorized", accounts: [] });
    });

    it("returns sorted accounts for authenticated user", async () => {
      authed();
      const mockAccounts = [
        {
          id: "acc-1",
          userId: MOCK_USER.id,
          provider: "Solana",
          name: "Solana Wallet (7xKX...AsU)",
          type: "crypto",
          balanceUsd: 1500,
          externalId: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          metadata: "{}",
          lastSyncedAt: new Date().toISOString(),
          isHidden: false,
          includeInNetWorth: true,
          category: "crypto",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      // db.select().from().where().orderBy().all()
      dbQueue.push(mockAccounts);

      const result = await getSolanaWallets();
      expect(result).toEqual({ accounts: mockAccounts });
    });

    it("returns empty accounts array when user has none", async () => {
      authed();
      dbQueue.push([]);

      const result = await getSolanaWallets();
      expect(result).toEqual({ accounts: [] });
    });
  });
});
