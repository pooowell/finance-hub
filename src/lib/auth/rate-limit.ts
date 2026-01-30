/**
 * In-memory sliding window rate limiter.
 *
 * Stores timestamps of recent attempts per key and prunes
 * expired entries on every check.
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();

  /**
   * Check whether `key` is within the allowed rate limit.
   *
   * @returns `{ allowed: true }` if under the limit, or
   *          `{ allowed: false, retryAfterMs }` if blocked.
   */
  checkLimit(
    key: string,
    maxAttempts: number,
    windowMs: number
  ): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Get existing timestamps and prune expired ones
    const timestamps = (this.attempts.get(key) ?? []).filter(
      (t) => t > cutoff
    );

    if (timestamps.length >= maxAttempts) {
      // Earliest timestamp still inside the window determines retry delay
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      // Store the pruned list back (no new entry added when blocked)
      this.attempts.set(key, timestamps);
      return { allowed: false, retryAfterMs };
    }

    // Record this attempt
    timestamps.push(now);
    this.attempts.set(key, timestamps);
    return { allowed: true };
  }

  /** Visible-for-testing: return the internal map size. */
  get size(): number {
    return this.attempts.size;
  }

  /** Visible-for-testing: clear all stored data. */
  reset(): void {
    this.attempts.clear();
  }
}

/** 5 attempts per 15 minutes per email */
export const signinLimiter = new RateLimiter();

/** 10 attempts per 1 hour per key */
export const signupLimiter = new RateLimiter();
