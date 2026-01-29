import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("Password Utils", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should produce different hashes for same password (salt)", async () => {
      const password = "testPassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Argon2 includes salt, so hashes should be different
      expect(hash1).not.toBe(hash2);
    });

    it("should hash an empty string", async () => {
      const hash = await hashPassword("");

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
    });

    it("should hash unicode passwords", async () => {
      const password = "パスワード123🔐";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
    });

    it("should hash long passwords", async () => {
      const password = "a".repeat(1000);
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
    });
  });

  describe("verifyPassword", () => {
    it("should verify a correct password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, password);

      expect(isValid).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const password = "testPassword123";
      const wrongPassword = "wrongPassword456";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, wrongPassword);

      expect(isValid).toBe(false);
    });

    it("should reject empty password against valid hash", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, "");

      expect(isValid).toBe(false);
    });

    it("should verify unicode passwords correctly", async () => {
      const password = "パスワード123🔐";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, password);
      const isInvalid = await verifyPassword(hash, "パスワード123");

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    it("should be case sensitive", async () => {
      const password = "TestPassword";
      const hash = await hashPassword(password);

      const isValidLower = await verifyPassword(hash, "testpassword");
      const isValidUpper = await verifyPassword(hash, "TESTPASSWORD");
      const isValidOriginal = await verifyPassword(hash, password);

      expect(isValidLower).toBe(false);
      expect(isValidUpper).toBe(false);
      expect(isValidOriginal).toBe(true);
    });

    it("should reject similar passwords", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      const results = await Promise.all([
        verifyPassword(hash, "testPassword12"),
        verifyPassword(hash, "testPassword1234"),
        verifyPassword(hash, "testPassword123 "),
        verifyPassword(hash, " testPassword123"),
      ]);

      expect(results.every((r) => r === false)).toBe(true);
    });
  });

  describe("hashPassword and verifyPassword integration", () => {
    it("should work with special characters", async () => {
      const specialPasswords = [
        "pass!@#$%^&*()",
        "pass with spaces",
        "pass\twith\ttabs",
        "pass\nwith\nnewlines",
        'pass"with"quotes',
        "pass'with'apostrophes",
      ];

      for (const password of specialPasswords) {
        const hash = await hashPassword(password);
        const isValid = await verifyPassword(hash, password);
        expect(isValid).toBe(true);
      }
    });
  });
});
