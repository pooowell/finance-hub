import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb before importing route
const mockRun = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    run: mockRun,
  })),
}));

import { GET } from "./route";

describe("/api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with healthy status when DB is connected", async () => {
    mockRun.mockReturnValue(undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.database).toBe("connected");
  });

  it("returns 503 with unhealthy status when DB throws", async () => {
    mockRun.mockImplementation(() => {
      throw new Error("SQLITE_CANTOPEN: unable to open database file");
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.database).toBe("disconnected");
  });

  it("includes all expected fields in response", async () => {
    mockRun.mockReturnValue(undefined);

    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("database");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");

    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.version).toBe("0.1.0");
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });

  it("returns valid ISO timestamp", async () => {
    mockRun.mockReturnValue(undefined);

    const before = new Date().toISOString();
    const response = await GET();
    const body = await response.json();
    const after = new Date().toISOString();

    expect(body.timestamp >= before).toBe(true);
    expect(body.timestamp <= after).toBe(true);
  });
});
