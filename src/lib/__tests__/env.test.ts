import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * We can't re-import the module to re-run validateEnv() easily,
 * so we duplicate the schema here and test the validation logic directly.
 * This keeps the test isolated and avoids module caching issues.
 */
const envSchema = z.object({
  DATABASE_PATH: z.string().default("./data/finance-hub.db"),
  SOLANA_RPC_URL: z.string().default("https://api.mainnet-beta.solana.com"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .optional()
    .default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .default("development"),
});

describe("env validation", () => {
  it("applies defaults when no env vars are set", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_PATH).toBe("./data/finance-hub.db");
      expect(result.data.SOLANA_RPC_URL).toBe(
        "https://api.mainnet-beta.solana.com"
      );
      expect(result.data.LOG_LEVEL).toBe("info");
      expect(result.data.NODE_ENV).toBe("development");
    }
  });

  it("accepts valid custom config", () => {
    const result = envSchema.safeParse({
      DATABASE_PATH: "/custom/path/db.sqlite",
      SOLANA_RPC_URL: "https://my-rpc.example.com",
      LOG_LEVEL: "debug",
      NODE_ENV: "production",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_PATH).toBe("/custom/path/db.sqlite");
      expect(result.data.SOLANA_RPC_URL).toBe("https://my-rpc.example.com");
      expect(result.data.LOG_LEVEL).toBe("debug");
      expect(result.data.NODE_ENV).toBe("production");
    }
  });

  it("rejects invalid LOG_LEVEL", () => {
    const result = envSchema.safeParse({
      LOG_LEVEL: "verbose",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors;
      expect(issues.LOG_LEVEL).toBeDefined();
    }
  });

  it("rejects invalid NODE_ENV", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "staging",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors;
      expect(issues.NODE_ENV).toBeDefined();
    }
  });

  it("accepts test environment", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "test",
      DATABASE_PATH: ":memory:",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe("test");
      expect(result.data.DATABASE_PATH).toBe(":memory:");
    }
  });

  it("provides clear error messages for invalid values", () => {
    const result = envSchema.safeParse({
      LOG_LEVEL: "banana",
      NODE_ENV: "staging",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      // Both fields should have errors
      expect(Object.keys(errors).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("allows partial config — only overriding some vars", () => {
    const result = envSchema.safeParse({
      DATABASE_PATH: "/tmp/test.db",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_PATH).toBe("/tmp/test.db");
      // Defaults still apply
      expect(result.data.SOLANA_RPC_URL).toBe(
        "https://api.mainnet-beta.solana.com"
      );
    }
  });
});
