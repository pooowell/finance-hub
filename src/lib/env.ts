import { z } from "zod";

/**
 * Centralized environment variable validation.
 * All env vars used across the codebase are defined here with Zod schemas.
 * Fails fast at startup with clear error messages if required vars are missing.
 */
const envSchema = z.object({
  DATABASE_PATH: z.string().default("./data/finance-hub.db"),
  SOLANA_RPC_URL: z.string().default("https://api.mainnet-beta.solana.com"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info")
    .optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development")
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${msgs?.join(", ")}`)
      .join("\n");

    throw new Error(
      `❌ Invalid environment variables:\n${errorMessages}\n\nPlease check your .env file or environment configuration.`
    );
  }

  return result.data;
}

export const env = validateEnv();
