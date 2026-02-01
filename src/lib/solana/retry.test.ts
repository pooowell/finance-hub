import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withRetry,
  isTransientError,
  SolanaRpcError,
  SolanaInvalidAddressError,
} from "./retry";

describe("retry utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // isTransientError
  // =========================================================================
  describe("isTransientError", () => {
    it("returns true for network-related errors", () => {
      expect(isTransientError(new Error("fetch failed"))).toBe(true);
      expect(isTransientError(new Error("network error"))).toBe(true);
      expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
      expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
      expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
      expect(isTransientError(new Error("timeout"))).toBe(true);
      expect(isTransientError(new Error("socket hang up"))).toBe(true);
    });

    it("returns true for rate limit errors", () => {
      expect(isTransientError(new Error("429 Too Many Requests"))).toBe(true);
      expect(isTransientError(new Error("too many requests"))).toBe(true);
    });

    it("returns true for server errors", () => {
      expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
      expect(isTransientError(new Error("502 Bad Gateway"))).toBe(true);
      expect(isTransientError(new Error("Server error"))).toBe(true);
      expect(isTransientError(new Error("Internal error"))).toBe(true);
    });

    it("returns true for SolanaRpcError with isTransient=true", () => {
      const err = new SolanaRpcError("RPC overloaded", {
        statusCode: 503,
        isTransient: true,
      });
      expect(isTransientError(err)).toBe(true);
    });

    it("returns false for SolanaRpcError with isTransient=false", () => {
      const err = new SolanaRpcError("Invalid params", {
        statusCode: 400,
        isTransient: false,
      });
      expect(isTransientError(err)).toBe(false);
    });

    it("returns false for SolanaInvalidAddressError", () => {
      expect(
        isTransientError(new SolanaInvalidAddressError("bad-addr"))
      ).toBe(false);
    });

    it("returns false for generic permanent errors", () => {
      expect(isTransientError(new Error("Invalid public key input"))).toBe(false);
      expect(isTransientError(new Error("some unknown error"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isTransientError("string error")).toBe(false);
      expect(isTransientError(42)).toBe(false);
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });
  });

  // =========================================================================
  // SolanaRpcError
  // =========================================================================
  describe("SolanaRpcError", () => {
    it("sets name, message, statusCode, isTransient", () => {
      const err = new SolanaRpcError("test", {
        statusCode: 429,
        isTransient: true,
      });
      expect(err.name).toBe("SolanaRpcError");
      expect(err.message).toBe("test");
      expect(err.statusCode).toBe(429);
      expect(err.isTransient).toBe(true);
    });

    it("defaults isTransient to false", () => {
      const err = new SolanaRpcError("test");
      expect(err.isTransient).toBe(false);
    });

    it("preserves cause", () => {
      const cause = new Error("root cause");
      const err = new SolanaRpcError("wrapped", { cause });
      expect(err.cause).toBe(cause);
    });
  });

  // =========================================================================
  // SolanaInvalidAddressError
  // =========================================================================
  describe("SolanaInvalidAddressError", () => {
    it("sets name and message with address", () => {
      const err = new SolanaInvalidAddressError("xyz");
      expect(err.name).toBe("SolanaInvalidAddressError");
      expect(err.message).toBe("Invalid Solana address: xyz");
    });
  });

  // =========================================================================
  // withRetry
  // =========================================================================
  describe("withRetry", () => {
    it("returns on first success without retrying", async () => {
      const fn = vi.fn().mockResolvedValue("ok");

      const result = await withRetry(fn);

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on transient errors and succeeds", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockRejectedValueOnce(new Error("503 Service Unavailable"))
        .mockResolvedValue("recovered");

      const promise = withRetry(fn, { baseDelayMs: 100, maxDelayMs: 1000 });

      // Run all timers to completion
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("does not retry on permanent errors", async () => {
      const permanentError = new SolanaInvalidAddressError("bad");
      const fn = vi.fn().mockRejectedValue(permanentError);

      await expect(withRetry(fn)).rejects.toThrow(SolanaInvalidAddressError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("does not retry on generic non-transient errors", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("Invalid public key input"));

      await expect(withRetry(fn)).rejects.toThrow("Invalid public key input");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws after max attempts exhausted", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("timeout"));

      const promise = withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
      });

      // Capture rejection immediately to prevent unhandled rejection
      const rejection = promise.catch((err: Error) => err);

      // Run all pending timers to completion
      await vi.runAllTimersAsync();

      const error = await rejection;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("timeout");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("applies exponential backoff correctly", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue("ok");

      const promise = withRetry(fn, {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
      });

      // After attempt 1: delay should be 1000ms (1000 * 2^0)
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(fn).toHaveBeenCalledTimes(1); // still waiting
      await vi.advanceTimersByTimeAsync(1);
      // Now attempt 2 fires — advance microtasks
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(2);

      // After attempt 2: delay should be 2000ms (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(1999);
      expect(fn).toHaveBeenCalledTimes(2); // still waiting
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(3);

      // After attempt 3: delay should be 4000ms (1000 * 2^2)
      await vi.advanceTimersByTimeAsync(3999);
      expect(fn).toHaveBeenCalledTimes(3); // still waiting
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(0);

      const result = await promise;
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it("caps delay at maxDelayMs", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout")) // delay: min(1000, 2000) = 1000
        .mockRejectedValueOnce(new Error("timeout")) // delay: min(2000, 2000) = 2000
        .mockRejectedValueOnce(new Error("timeout")) // delay: min(4000, 2000) = 2000 (capped!)
        .mockResolvedValue("ok");

      const promise = withRetry(fn, {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 2000,
      });

      // Run all timers to completion
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it("wraps non-Error rejections in Error", async () => {
      const fn = vi.fn().mockRejectedValue("string error");

      await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow("string error");
    });

    it("uses default options when none provided", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue("ok");

      const promise = withRetry(fn);

      // Default baseDelayMs is 1000
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
