import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseAccessUrl,
  claimSetupToken,
  fetchAccounts,
  fetchWithRetry,
  validateAccessUrl,
  RETRY_DEFAULTS,
} from "./client";
import type { SimpleFINAccountSet, SimpleFINCredentials } from "@/types/simplefin";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SimpleFIN Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("parseAccessUrl", () => {
    it("should parse a standard access URL", () => {
      const accessUrl = "https://user123:pass456@api.simplefin.org/accounts";
      const result = parseAccessUrl(accessUrl);

      expect(result.url).toBe(accessUrl);
      expect(result.scheme).toBe("https");
      expect(result.username).toBe("user123");
      expect(result.password).toBe("pass456");
      expect(result.host).toBe("api.simplefin.org");
      expect(result.path).toBe("/accounts");
    });

    it("should parse URL with complex credentials", () => {
      const accessUrl = "https://abc%40def:my%23pass@bridge.simplefin.org/path/to/accounts";
      const result = parseAccessUrl(accessUrl);

      expect(result.scheme).toBe("https");
      expect(result.username).toBe("abc%40def");
      expect(result.password).toBe("my%23pass");
      expect(result.host).toBe("bridge.simplefin.org");
    });

    it("should handle HTTP scheme", () => {
      const accessUrl = "http://user:pass@localhost:3000/accounts";
      const result = parseAccessUrl(accessUrl);

      expect(result.scheme).toBe("http");
      expect(result.host).toBe("localhost:3000");
    });

    it("should handle URLs with port numbers", () => {
      const accessUrl = "https://user:pass@api.simplefin.org:8443/accounts";
      const result = parseAccessUrl(accessUrl);

      expect(result.host).toBe("api.simplefin.org:8443");
    });

    it("should preserve the path", () => {
      const accessUrl = "https://user:pass@api.simplefin.org/v1/data/accounts";
      const result = parseAccessUrl(accessUrl);

      expect(result.path).toBe("/v1/data/accounts");
    });
  });

  describe("claimSetupToken", () => {
    it("should claim a setup token and return access URL", async () => {
      const setupToken = Buffer.from("https://claim.simplefin.org/setup/abc123").toString("base64");
      const expectedAccessUrl = "https://user:pass@api.simplefin.org/accounts";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => expectedAccessUrl,
      });

      const result = await claimSetupToken(setupToken);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://claim.simplefin.org/setup/abc123",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
      );
      expect(result).toBe(expectedAccessUrl);
    });

    it("should throw error on failed claim", async () => {
      const setupToken = Buffer.from("https://claim.simplefin.org/setup/abc123").toString("base64");

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      await expect(claimSetupToken(setupToken)).rejects.toThrow(
        "Failed to claim setup token: Not Found"
      );
    });

    it("should trim whitespace from access URL response", async () => {
      const setupToken = Buffer.from("https://claim.simplefin.org/setup/abc123").toString("base64");
      const accessUrlWithWhitespace = "  https://user:pass@api.simplefin.org/accounts  \n";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => accessUrlWithWhitespace,
      });

      const result = await claimSetupToken(setupToken);

      expect(result).toBe("https://user:pass@api.simplefin.org/accounts");
    });
  });

  describe("fetchAccounts", () => {
    const mockCredentials: SimpleFINCredentials = {
      accessUrl: "https://user123:pass456@api.simplefin.org/data",
    };

    const mockAccountSet: SimpleFINAccountSet = {
      errors: [],
      accounts: [
        {
          org: { domain: "chase.com", name: "Chase" },
          id: "acc-123",
          name: "Checking",
          currency: "USD",
          balance: "1000.00",
          "balance-date": 1705593600,
        },
      ],
    };

    it("should fetch accounts successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccountSet,
      });

      const result = await fetchAccounts(mockCredentials);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.simplefin.org/data/accounts",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
            Accept: "application/json",
          }),
        })
      );
      expect(result).toEqual(mockAccountSet);
    });

    it("should include start-date parameter when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccountSet,
      });

      const startDate = new Date("2024-01-01T00:00:00Z");
      await fetchAccounts(mockCredentials, { startDate });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("start-date=");
    });

    it("should include end-date parameter when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccountSet,
      });

      const endDate = new Date("2024-01-31T23:59:59Z");
      await fetchAccounts(mockCredentials, { endDate });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("end-date=");
    });

    it("should include account filter when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccountSet,
      });

      await fetchAccounts(mockCredentials, {
        accountIds: ["acc-1", "acc-2"],
      });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("account=acc-1%2Cacc-2");
    });

    it("should throw on 403 access denied", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      await expect(fetchAccounts(mockCredentials)).rejects.toThrow(
        "SimpleFIN access denied. Please reconnect your account."
      );
    });

    it("should throw on other API errors", async () => {
      const error500 = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      };
      // fetchWithRetry retries 5xx – provide enough mocks to exhaust retries
      mockFetch
        .mockResolvedValueOnce(error500)
        .mockResolvedValueOnce(error500)
        .mockResolvedValueOnce(error500)
        .mockResolvedValueOnce(error500);

      await expect(fetchAccounts(mockCredentials)).rejects.toThrow(
        "SimpleFIN API error: Internal Server Error"
      );
    });

    it("should encode credentials correctly in Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccountSet,
      });

      await fetchAccounts(mockCredentials);

      const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
      const expectedAuth = Buffer.from("user123:pass456").toString("base64");
      expect(authHeader).toBe(`Basic ${expectedAuth}`);
    });

    it("should handle URLs with trailing slashes", async () => {
      const credentialsWithSlash: SimpleFINCredentials = {
        accessUrl: "https://user123:pass456@api.simplefin.org/data/",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccountSet,
      });

      await fetchAccounts(credentialsWithSlash);

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("/accounts");
      expect(callUrl).not.toContain("//accounts");
    });
  });

  // -----------------------------------------------------------------------
  // fetchWithRetry
  // -----------------------------------------------------------------------
  describe("fetchWithRetry", () => {
    /** Fast config so tests don't actually wait. */
    const fastConfig = { maxRetries: 3, baseDelayMs: 1, timeoutMs: 5_000 };

    it("should return response on 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await fetchWithRetry("https://example.com", undefined, fastConfig);

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should retry on 500 and eventually return last response", async () => {
      const serverError = { ok: false, status: 500, statusText: "Internal Server Error" };
      mockFetch
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(serverError); // initial + 3 retries

      const res = await fetchWithRetry("https://example.com", undefined, fastConfig);

      expect(res.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 + 3 retries
    });

    it("should succeed on retry after transient 500", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: "Bad Gateway" })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await fetchWithRetry("https://example.com", undefined, fastConfig);

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should NOT retry on 4xx (e.g. 404)", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" });

      const res = await fetchWithRetry("https://example.com", undefined, fastConfig);

      expect(res.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on 403", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" });

      const res = await fetchWithRetry("https://example.com", undefined, fastConfig);

      expect(res.status).toBe(403);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should retry on 429 (Too Many Requests)", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests" })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await fetchWithRetry("https://example.com", undefined, fastConfig);

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should retry on network errors (TypeError)", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await fetchWithRetry("https://example.com", undefined, fastConfig);

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw after exhausting retries on network error", async () => {
      const networkErr = new TypeError("fetch failed");
      mockFetch
        .mockRejectedValueOnce(networkErr)
        .mockRejectedValueOnce(networkErr)
        .mockRejectedValueOnce(networkErr)
        .mockRejectedValueOnce(networkErr);

      await expect(
        fetchWithRetry("https://example.com", undefined, fastConfig)
      ).rejects.toThrow("fetch failed");

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("should apply AbortSignal timeout to each request", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await fetchWithRetry("https://example.com", undefined, {
        ...fastConfig,
        timeoutMs: 10_000,
      });

      // Verify signal was passed
      const callInit = mockFetch.mock.calls[0][1];
      expect(callInit.signal).toBeDefined();
      expect(callInit.signal).toBeInstanceOf(AbortSignal);
    });

    it("should merge init options with signal", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await fetchWithRetry(
        "https://example.com",
        { method: "POST", headers: { "X-Custom": "yes" } },
        fastConfig,
      );

      const callInit = mockFetch.mock.calls[0][1];
      expect(callInit.method).toBe("POST");
      expect(callInit.headers["X-Custom"]).toBe("yes");
      expect(callInit.signal).toBeDefined();
    });

    it("should use RETRY_DEFAULTS when no config provided", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      // Just verify it doesn't throw and uses defaults
      const res = await fetchWithRetry("https://example.com");
      expect(res.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // RETRY_DEFAULTS config
  // -----------------------------------------------------------------------
  describe("RETRY_DEFAULTS", () => {
    it("claim config should have 30s timeout", () => {
      expect(RETRY_DEFAULTS.claim.timeoutMs).toBe(30_000);
      expect(RETRY_DEFAULTS.claim.maxRetries).toBe(3);
    });

    it("accounts config should have 60s timeout", () => {
      expect(RETRY_DEFAULTS.accounts.timeoutMs).toBe(60_000);
      expect(RETRY_DEFAULTS.accounts.maxRetries).toBe(3);
    });

    it("should be mutable for testing overrides", () => {
      const original = { ...RETRY_DEFAULTS.claim };
      RETRY_DEFAULTS.claim.maxRetries = 0;
      expect(RETRY_DEFAULTS.claim.maxRetries).toBe(0);
      // Restore
      Object.assign(RETRY_DEFAULTS.claim, original);
    });
  });

  describe("validateAccessUrl", () => {
    const mockCredentials: SimpleFINCredentials = {
      accessUrl: "https://user123:pass456@api.simplefin.org/data",
    };

    it("should return true for valid credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errors: [], accounts: [] }),
      });

      const result = await validateAccessUrl(mockCredentials);

      expect(result).toBe(true);
    });

    it("should return false when fetchAccounts throws", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      const result = await validateAccessUrl(mockCredentials);

      expect(result).toBe(false);
    });

    it("should return false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await validateAccessUrl(mockCredentials);

      expect(result).toBe(false);
    });
  });
});
