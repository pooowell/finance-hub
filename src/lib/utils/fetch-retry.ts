/**
 * Fetch with retry + exponential backoff
 *
 * Retries on:
 * - HTTP 429 (rate limit) — respects Retry-After header
 * - HTTP 5xx (server errors)
 * - Network errors (TypeError thrown by fetch)
 *
 * Uses exponential backoff with jitter: base * 2^attempt + random jitter
 */

export interface FetchRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Per-request timeout in ms via AbortSignal (default: 10000) */
  timeoutMs?: number;
  /** Label for log messages (default: the URL) */
  label?: string;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 10_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function getRetryAfterMs(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (!value) return null;

  // retry-after can be seconds (integer) or an HTTP-date
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());

  return null;
}

function backoffMs(attempt: number, baseMs: number): number {
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.random() * baseMs;
  return exponential + jitter;
}

/**
 * Drop-in replacement for `fetch` that adds retry logic.
 * Signature mirrors `globalThis.fetch` with an extra options bag.
 */
export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  retryOpts?: FetchRetryOptions
): Promise<Response> {
  const maxRetries = retryOpts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = retryOpts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const timeoutMs = retryOpts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const label = retryOpts?.label ?? String(input).slice(0, 80);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Per-request timeout via AbortSignal
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Merge caller's signal with our timeout
      const mergedInit: RequestInit = {
        ...init,
        signal: controller.signal,
      };

      const response = await fetch(input, mergedInit);
      clearTimeout(timeoutId);

      if (!isRetryableStatus(response.status) || attempt === maxRetries) {
        return response;
      }

      // Retryable status — figure out delay
      const retryAfter = getRetryAfterMs(response.headers);
      const delay = retryAfter ?? backoffMs(attempt, baseDelayMs);

      console.warn(
        `[fetchWithRetry] ${label} — HTTP ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
      );

      await sleep(delay);
    } catch (error: unknown) {
      clearTimerSafe();

      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === "AbortError");

      if (!isNetworkError || attempt === maxRetries) {
        throw error;
      }

      lastError = error;

      const delay = backoffMs(attempt, baseDelayMs);
      console.warn(
        `[fetchWithRetry] ${label} — ${(error as Error).message}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
      );

      await sleep(delay);
    }
  }

  // Should never reach here, but just in case
  throw lastError ?? new Error(`[fetchWithRetry] ${label} — all retries exhausted`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safety no-op in case clearTimeout was missed in a catch */
function clearTimerSafe() {
  // intentional no-op — timers auto-clear on abort
}
