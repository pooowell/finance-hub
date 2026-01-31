import { describe, it, expect, vi, afterEach } from "vitest";
import { calculate24hChange, type ChartDataPoint } from "./portfolio";

describe("calculate24hChange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zeros for empty history", () => {
    const result = calculate24hChange([], 1000);
    expect(result).toEqual({ change24h: 0, changePercent24h: 0 });
  });

  it("returns zeros when currentValue is 0 and history is empty", () => {
    const result = calculate24hChange([], 0);
    expect(result).toEqual({ change24h: 0, changePercent24h: 0 });
  });

  it("calculates change from a single data point", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const history: ChartDataPoint[] = [
      { timestamp: "2025-05-31T12:00:00Z", value: 900 },
    ];

    const result = calculate24hChange(history, 1000);
    expect(result.change24h).toBe(100);
    expect(result.changePercent24h).toBeCloseTo(11.111, 2);
  });

  it("picks the closest point to 24h ago", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z").getTime();
    vi.setSystemTime(now);

    // 24h ago = 2025-05-31T12:00:00Z
    const history: ChartDataPoint[] = [
      { timestamp: "2025-05-31T06:00:00Z", value: 800 },  // 30h ago
      { timestamp: "2025-05-31T11:00:00Z", value: 950 },  // 25h ago — closest
      { timestamp: "2025-05-31T18:00:00Z", value: 970 },  // 18h ago
      { timestamp: "2025-06-01T06:00:00Z", value: 990 },  // 6h ago
    ];

    const result = calculate24hChange(history, 1000);
    // Should use 950 (25h ago is closest to 24h target)
    expect(result.change24h).toBe(50);
    expect(result.changePercent24h).toBeCloseTo(5.263, 2);
  });

  it("falls back to oldest point when no data near 24h", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z").getTime();
    vi.setSystemTime(now);

    // All points are recent — oldest is 2h ago, which is still "closest" to 24h
    const history: ChartDataPoint[] = [
      { timestamp: "2025-06-01T10:00:00Z", value: 980 },  // 2h ago
      { timestamp: "2025-06-01T11:00:00Z", value: 990 },  // 1h ago
      { timestamp: "2025-06-01T11:30:00Z", value: 995 },  // 30m ago
    ];

    const result = calculate24hChange(history, 1000);
    // Oldest (2h ago) is closest to 24h target
    expect(result.change24h).toBe(20);
    expect(result.changePercent24h).toBeCloseTo(2.041, 2);
  });

  it("handles exact 24h match", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const history: ChartDataPoint[] = [
      { timestamp: "2025-05-31T12:00:00Z", value: 500 },  // exactly 24h
      { timestamp: "2025-06-01T00:00:00Z", value: 750 },
    ];

    const result = calculate24hChange(history, 1000);
    expect(result.change24h).toBe(500);
    expect(result.changePercent24h).toBe(100);
  });

  it("handles negative change (portfolio decreased)", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const history: ChartDataPoint[] = [
      { timestamp: "2025-05-31T12:00:00Z", value: 1200 },
    ];

    const result = calculate24hChange(history, 1000);
    expect(result.change24h).toBe(-200);
    expect(result.changePercent24h).toBeCloseTo(-16.667, 2);
  });

  it("handles previous value of zero (avoids division by zero)", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const history: ChartDataPoint[] = [
      { timestamp: "2025-05-31T12:00:00Z", value: 0 },
    ];

    const result = calculate24hChange(history, 1000);
    expect(result.change24h).toBe(1000);
    expect(result.changePercent24h).toBe(0); // can't compute % from 0
  });

  it("handles no change", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const history: ChartDataPoint[] = [
      { timestamp: "2025-05-31T12:00:00Z", value: 1000 },
    ];

    const result = calculate24hChange(history, 1000);
    expect(result.change24h).toBe(0);
    expect(result.changePercent24h).toBe(0);
  });

  it("works with many data points across multiple days", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-03T12:00:00Z").getTime();
    vi.setSystemTime(now);

    // Generate points every 6h for 3 days
    const history: ChartDataPoint[] = [];
    for (let i = 0; i < 12; i++) {
      const ts = new Date(now - i * 6 * 60 * 60 * 1000).toISOString();
      history.push({ timestamp: ts, value: 1000 + i * 10 });
    }

    const result = calculate24hChange(history, 1050);
    // 24h ago = index 4 (4 * 6h = 24h), value = 1000 + 4*10 = 1040
    expect(result.change24h).toBe(10);
    expect(result.changePercent24h).toBeCloseTo(0.962, 2);
  });
});
