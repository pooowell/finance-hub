import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry } from "./fetch-retry";

// Fast timers — no real waiting in tests
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function jsonResponse(body: object, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("fetchWithRetry", () => {
  it("returns immediately on 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await fetchWithRetry("https://example.com/api");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns non-retryable 4xx errors without retry", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 400));
    vi.stubGlobal("fetch", mockFetch);

    const res = await fetchWithRetry("https://example.com/api", undefined, { maxRetries: 3 });
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on HTTP 429 and succeeds", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", mockFetch);

    const res = await fetchWithRetry("https://example.com/api", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on HTTP 500 and succeeds", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 502))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", mockFetch);

    const res = await fetchWithRetry("https://example.com/api", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("respects Retry-After header (seconds)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await fetchWithRetry("https://example.com/api", undefined, {
      maxRetries: 2,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    // The warn message should mention the retry delay
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("2000ms"));
  });

  it("retries on TypeError (network error) and succeeds", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await fetchWithRetry("https://example.com/api", undefined, {
      maxRetries: 2,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on network error", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      fetchWithRetry("https://example.com/api", undefined, {
        maxRetries: 2,
        baseDelayMs: 10,
      })
    ).rejects.toThrow("Failed to fetch");
    // 1 initial + 2 retries
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns last retryable response after exhausting retries on 5xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({}, 503));
    vi.stubGlobal("fetch", mockFetch);

    const res = await fetchWithRetry("https://example.com/api", undefined, {
      maxRetries: 2,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(503);
    // 1 initial + 2 retries
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable errors (e.g. RangeError)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new RangeError("bad"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      fetchWithRetry("https://example.com/api", undefined, { maxRetries: 3, baseDelayMs: 10 })
    ).rejects.toThrow("bad");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("logs retry attempts via console.warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", mockFetch);

    await fetchWithRetry("https://example.com/api", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
      label: "TestAPI",
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[fetchWithRetry] TestAPI")
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("attempt 1/3")
    );
  });

  it("attaches AbortSignal timeout to each request", async () => {
    // Verify that the init passed to fetch has a signal
    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchWithRetry("https://example.com/api", undefined, { timeoutMs: 5000 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
