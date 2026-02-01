/**
 * Portfolio utility functions for calculating changes over time.
 */

export interface ChartDataPoint {
  timestamp: string;
  value: number;
}

export interface PortfolioChange {
  change24h: number;
  changePercent24h: number;
}

const MS_IN_24H = 24 * 60 * 60 * 1000;

/**
 * Calculate 24-hour portfolio change from history data.
 *
 * Finds the data point closest to 24 hours ago and computes the
 * absolute and percentage change relative to the current value.
 *
 * Edge cases:
 * - Empty history → returns zeros
 * - Single data point → uses that as the baseline
 * - No point near 24h ago → falls back to the oldest available point
 * - Previous value of 0 → percentage change is 0 (avoids division by zero)
 */
export function calculate24hChange(
  history: ChartDataPoint[],
  currentValue: number,
): PortfolioChange {
  if (history.length === 0) {
    return { change24h: 0, changePercent24h: 0 };
  }

  const now = Date.now();
  const target = now - MS_IN_24H;

  // Find the data point closest to 24h ago
  let closest = history[0];
  let closestDiff = Math.abs(new Date(closest.timestamp).getTime() - target);

  for (let i = 1; i < history.length; i++) {
    const diff = Math.abs(new Date(history[i].timestamp).getTime() - target);
    if (diff < closestDiff) {
      closest = history[i];
      closestDiff = diff;
    }
  }

  const previousValue = closest.value;
  const change24h = currentValue - previousValue;

  // Avoid division by zero
  const changePercent24h =
    previousValue === 0 ? 0 : (change24h / previousValue) * 100;

  return { change24h, changePercent24h };
}
