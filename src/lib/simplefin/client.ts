/**
 * SimpleFIN Bridge API Client
 * https://www.simplefin.org/protocol.html
 */

import type {
  SimpleFINAccessURL,
  SimpleFINAccountSet,
  SimpleFINCredentials,
} from "@/types/simplefin";

// ---------------------------------------------------------------------------
// Retry / timeout configuration
// ---------------------------------------------------------------------------

export interface RetryConfig {
  /** Maximum number of retry attempts (not counting the initial request) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (delay = base * 2^attempt) */
  baseDelayMs: number;
  /** Request timeout in ms (applied via AbortSignal.timeout) */
  timeoutMs: number;
}

/** Default retry settings – override per-call or swap for testing. */
export const RETRY_DEFAULTS = {
  claim: { maxRetries: 3, baseDelayMs: 500, timeoutMs: 30_000 } satisfies RetryConfig,
  accounts: { maxRetries: 3, baseDelayMs: 500, timeoutMs: 60_000 } satisfies RetryConfig,
};

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

/** Errors that indicate the request never got a response (network-level). */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch throws TypeError on network failure
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return false;
}

/** Returns true for status codes that should trigger a retry. */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/**
 * Wrapper around `fetch()` that adds:
 * - AbortSignal-based timeout
 * - Exponential-backoff retries for 5xx / 429 / network errors
 * - No retry on 4xx (except 429)
 */
export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  config?: Partial<RetryConfig>,
): Promise<Response> {
  const { maxRetries, baseDelayMs, timeoutMs } = {
    ...RETRY_DEFAULTS.accounts, // sensible fallback
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);

      const response = await fetch(input, { ...init, signal });

      // Non-retryable failure → throw immediately
      if (!response.ok && !isRetryableStatus(response.status)) {
        return response; // let caller inspect status
      }

      // Retryable server error – retry if attempts remain
      if (!response.ok && isRetryableStatus(response.status)) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        if (attempt < maxRetries) {
          await delay(baseDelayMs * Math.pow(2, attempt));
          continue;
        }
        return response; // exhausted retries – return last response
      }

      return response; // success
    } catch (err) {
      lastError = err;
      if (isNetworkError(err) && attempt < maxRetries) {
        await delay(baseDelayMs * Math.pow(2, attempt));
        continue;
      }
      throw err; // non-retryable or exhausted
    }
  }

  // Should be unreachable, but TypeScript needs it
  throw lastError;
}

/** Simple async delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses a SimpleFIN access URL into its components
 */
export function parseAccessUrl(accessUrl: string): SimpleFINAccessURL {
  const url = new URL(accessUrl);
  return {
    url: accessUrl,
    scheme: url.protocol.replace(":", ""),
    username: url.username,
    password: url.password,
    host: url.host,
    path: url.pathname,
  };
}

/**
 * Claims a SimpleFIN setup token and returns the access URL
 * This is called once when the user first connects their SimpleFIN account
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  // Decode the base64 setup token to get the claim URL
  const claimUrl = Buffer.from(setupToken, "base64").toString("utf-8");

  const response = await fetchWithRetry(
    claimUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
    RETRY_DEFAULTS.claim,
  );

  if (!response.ok) {
    throw new Error(`Failed to claim setup token: ${response.statusText}`);
  }

  // The response body is the access URL
  const accessUrl = await response.text();
  return accessUrl.trim();
}

/**
 * Fetches account data from SimpleFIN using the access URL
 */
export async function fetchAccounts(
  credentials: SimpleFINCredentials,
  options?: {
    startDate?: Date;
    endDate?: Date;
    accountIds?: string[];
  }
): Promise<SimpleFINAccountSet> {
  const parsed = parseAccessUrl(credentials.accessUrl);

  // Build the accounts URL
  const accountsUrl = new URL(`${parsed.scheme}://${parsed.host}${parsed.path}`);
  accountsUrl.pathname = accountsUrl.pathname.replace(/\/$/, "") + "/accounts";

  // Add query parameters
  if (options?.startDate) {
    accountsUrl.searchParams.set(
      "start-date",
      Math.floor(options.startDate.getTime() / 1000).toString()
    );
  }
  if (options?.endDate) {
    accountsUrl.searchParams.set(
      "end-date",
      Math.floor(options.endDate.getTime() / 1000).toString()
    );
  }
  if (options?.accountIds?.length) {
    accountsUrl.searchParams.set("account", options.accountIds.join(","));
  }

  // Create auth header
  const authHeader = Buffer.from(
    `${parsed.username}:${parsed.password}`
  ).toString("base64");

  const response = await fetchWithRetry(
    accountsUrl.toString(),
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${authHeader}`,
        Accept: "application/json",
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
      },
    } as RequestInit,
    RETRY_DEFAULTS.accounts,
  );

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("SimpleFIN access denied. Please reconnect your account.");
    }
    throw new Error(`SimpleFIN API error: ${response.statusText}`);
  }

  const data: SimpleFINAccountSet = await response.json();
  return data;
}

/**
 * Validates that the access URL is still valid
 */
export async function validateAccessUrl(
  credentials: SimpleFINCredentials
): Promise<boolean> {
  try {
    await fetchAccounts(credentials);
    return true;
  } catch {
    return false;
  }
}
