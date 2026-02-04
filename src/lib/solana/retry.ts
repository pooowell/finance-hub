/**
 * Retry utility for Solana RPC calls
 * Provides exponential backoff for transient errors
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Custom error for Solana RPC failures
 */
export class SolanaRpcError extends Error {
  public readonly statusCode?: number;
  public readonly isTransient: boolean;

  constructor(
    message: string,
    options?: { statusCode?: number; isTransient?: boolean; cause?: Error }
  ) {
    super(message);
    this.name = "SolanaRpcError";
    this.statusCode = options?.statusCode;
    this.isTransient = options?.isTransient ?? false;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Error for invalid Solana addresses (should not be retried)
 */
export class SolanaInvalidAddressError extends Error {
  constructor(address: string) {
    super(`Invalid Solana address: ${address}`);
    this.name = "SolanaInvalidAddressError";
  }
}

/**
 * Determines if an error is transient and should be retried
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof SolanaInvalidAddressError) {
    return false;
  }

  if (error instanceof SolanaRpcError) {
    return error.isTransient;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("timeout") ||
      message.includes("socket hang up")
    ) {
      return true;
    }

    // HTTP rate limiting and server errors
    if (message.includes("429") || message.includes("too many requests")) {
      return true;
    }
    if (message.includes("503") || message.includes("service unavailable")) {
      return true;
    }
    if (message.includes("502") || message.includes("bad gateway")) {
      return true;
    }

    // Solana RPC specific transient errors
    if (message.includes("server error") || message.includes("internal error")) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for given milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function with retry logic and exponential backoff.
 *
 * Only retries on transient errors (network issues, rate limits, server errors).
 * Permanent errors (invalid address, etc.) are thrown immediately.
 *
 * Backoff schedule:
 *   attempt 1 = baseDelayMs (1s default)
 *   attempt 2 = baseDelayMs * 2 (2s)
 *   attempt 3 = baseDelayMs * 4 (4s)
 *   ...capped at maxDelayMs
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  opts.maxAttempts = Math.max(1, Number(opts.maxAttempts) || 1);
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry permanent errors
      if (!isTransientError(error)) {
        throw lastError;
      }

      // Don't sleep after the last attempt
      if (attempt < opts.maxAttempts) {
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt - 1),
          opts.maxDelayMs
        );
        await sleep(delay);
      }
    }
  }

  // All attempts exhausted
  throw lastError!;
}
