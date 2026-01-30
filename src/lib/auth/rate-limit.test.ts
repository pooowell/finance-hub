import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 5; i++) {
      const result = limiter.checkLimit("user@test.com", 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    }
  });

  it("blocks after max attempts reached", () => {
    const key = "user@test.com";
    // Use up all 3 attempts
    for (let i = 0; i < 3; i++) {
      expect(limiter.checkLimit(key, 3, 60_000).allowed).toBe(true);
    }
    // 4th should be blocked
    const result = limiter.checkLimit(key, 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs!).toBeGreaterThan(0);
  });

  it("allows requests again after window expires", () => {
    const key = "user@test.com";
    const windowMs = 60_000;

    // Exhaust limit
    for (let i = 0; i < 3; i++) {
      limiter.checkLimit(key, 3, windowMs);
    }
    expect(limiter.checkLimit(key, 3, windowMs).allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Should be allowed again
    const result = limiter.checkLimit(key, 3, windowMs);
    expect(result.allowed).toBe(true);
  });

  it("treats different keys independently", () => {
    const windowMs = 60_000;

    // Exhaust limit for key A
    for (let i = 0; i < 3; i++) {
      limiter.checkLimit("a@test.com", 3, windowMs);
    }
    expect(limiter.checkLimit("a@test.com", 3, windowMs).allowed).toBe(false);

    // Key B should still be allowed
    const result = limiter.checkLimit("b@test.com", 3, windowMs);
    expect(result.allowed).toBe(true);
  });

  it("prunes expired entries on check", () => {
    const windowMs = 60_000;
    const key = "user@test.com";

    // Add 2 attempts at t=0
    limiter.checkLimit(key, 5, windowMs);
    limiter.checkLimit(key, 5, windowMs);

    // Advance past window so those 2 expire
    vi.advanceTimersByTime(windowMs + 1);

    // Add 3 more — should all be allowed (old ones pruned)
    for (let i = 0; i < 3; i++) {
      expect(limiter.checkLimit(key, 3, windowMs).allowed).toBe(true);
    }

    // Now at the new limit
    expect(limiter.checkLimit(key, 3, windowMs).allowed).toBe(false);
  });

  it("returns correct retryAfterMs", () => {
    const key = "user@test.com";
    const windowMs = 60_000;

    // First attempt at t=0
    limiter.checkLimit(key, 1, windowMs);

    // Advance 10 seconds
    vi.advanceTimersByTime(10_000);

    // Should be blocked; retryAfterMs ~ 50_000
    const result = limiter.checkLimit(key, 1, windowMs);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(50_000);
  });
});
