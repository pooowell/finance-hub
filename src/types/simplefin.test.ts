import { describe, it, expect } from "vitest";
import { inferAccountType, INSTITUTION_TYPE_MAP } from "./simplefin";
import type { SimpleFINOrganization } from "./simplefin";

describe("SimpleFIN Types", () => {
  describe("INSTITUTION_TYPE_MAP", () => {
    it("should map chase.com to checking", () => {
      expect(INSTITUTION_TYPE_MAP["chase.com"]).toBe("checking");
    });

    it("should map capitalone.com to checking", () => {
      expect(INSTITUTION_TYPE_MAP["capitalone.com"]).toBe("checking");
    });

    it("should map robinhood.com to investment", () => {
      expect(INSTITUTION_TYPE_MAP["robinhood.com"]).toBe("investment");
    });

    it("should map schwab.com to investment", () => {
      expect(INSTITUTION_TYPE_MAP["schwab.com"]).toBe("investment");
    });

    it("should map coinbase.com to crypto", () => {
      expect(INSTITUTION_TYPE_MAP["coinbase.com"]).toBe("crypto");
    });
  });

  describe("inferAccountType", () => {
    it("should return type from institution map when domain matches", () => {
      const org: SimpleFINOrganization = { domain: "chase.com", name: "Chase" };
      expect(inferAccountType(org, "Some Account")).toBe("checking");
    });

    it("should infer checking from account name", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "My Checking Account")).toBe("checking");
    });

    it("should infer savings from account name", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "High Yield Savings")).toBe("savings");
    });

    it("should infer credit from account name with 'credit'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Credit Line")).toBe("credit");
    });

    it("should infer credit from account name with 'card'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Platinum Card")).toBe("credit");
    });

    it("should infer investment from account name with 'investment'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Investment Portfolio")).toBe("investment");
    });

    it("should infer investment from account name with 'brokerage'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Brokerage Account")).toBe("investment");
    });

    it("should infer investment from account name with 'ira'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Roth IRA")).toBe("investment");
    });

    it("should infer investment from account name with '401k'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "401k Retirement")).toBe("investment");
    });

    it("should infer crypto from account name with 'crypto'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Crypto Wallet")).toBe("crypto");
    });

    it("should infer crypto from account name with 'bitcoin'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Bitcoin Holdings")).toBe("crypto");
    });

    it("should infer crypto from account name with 'ethereum'", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Ethereum Wallet")).toBe("crypto");
    });

    it("should return 'other' for unknown account types", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "Mystery Account")).toBe("other");
    });

    it("should be case insensitive for account name matching", () => {
      const org: SimpleFINOrganization = { domain: "unknown.com", name: "Unknown" };
      expect(inferAccountType(org, "CHECKING ACCOUNT")).toBe("checking");
      expect(inferAccountType(org, "Savings ACCOUNT")).toBe("savings");
    });
  });
});
