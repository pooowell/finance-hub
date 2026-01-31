import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function buildRequest(path = "/") {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("Security headers middleware", () => {
  beforeEach(() => {
    // Default to production for most tests
    vi.stubEnv("NODE_ENV", "production");
  });

  it("returns a response with X-Frame-Options: DENY", () => {
    const res = middleware(buildRequest());
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("returns a response with X-Content-Type-Options: nosniff", () => {
    const res = middleware(buildRequest());
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns a response with Referrer-Policy", () => {
    const res = middleware(buildRequest());
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("returns a response with Permissions-Policy", () => {
    const res = middleware(buildRequest());
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });

  it("returns a response with Strict-Transport-Security", () => {
    const res = middleware(buildRequest());
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains"
    );
  });

  it("returns a response with Content-Security-Policy containing required directives", () => {
    const res = middleware(buildRequest());
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("does NOT include unsafe-eval in production CSP", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = middleware(buildRequest());
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).not.toContain("unsafe-eval");
  });

  it("includes unsafe-eval in development CSP for Next.js HMR", () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = middleware(buildRequest());
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("'unsafe-eval'");
  });

  it("sets all security headers on every matched route", () => {
    const paths = ["/", "/dashboard", "/api/health", "/settings/profile"];
    const expectedHeaders = [
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
      "Content-Security-Policy",
    ];

    for (const path of paths) {
      const res = middleware(buildRequest(path));
      for (const header of expectedHeaders) {
        expect(res.headers.has(header), `${header} missing on ${path}`).toBe(
          true
        );
      }
    }
  });
});
