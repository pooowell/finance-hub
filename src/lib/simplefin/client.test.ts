import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseAccessUrl,
  claimSetupToken,
  fetchAccounts,
  validateAccessUrl,
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
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

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
