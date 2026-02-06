"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

interface ChartDataPoint {
  timestamp: string;
  value: number;
}

interface PortfolioChartProps {
  data: ChartDataPoint[];
  isLoading?: boolean;
}

type TimeframeOption = "1h" | "1d" | "1w" | "1m";

const TIMEFRAME_OPTIONS: { value: TimeframeOption; label: string }[] = [
  { value: "1h", label: "1H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(timestamp: string, timeframe: TimeframeOption): string {
  const date = new Date(timestamp);
  switch (timeframe) {
    case "1h":
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    case "1d":
      return date.toLocaleTimeString("en-US", { hour: "numeric" });
    case "1w":
      return date.toLocaleDateString("en-US", { weekday: "short" });
    case "1m":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    default:
      return date.toLocaleDateString();
  }
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
}

export function PortfolioChart({ data, isLoading }: PortfolioChartProps) {
  const [timeframe, setTimeframe] = useState<TimeframeOption>("1d");
  const [chartData, setChartData] = useState<ChartDataPoint[]>(data);

  useEffect(() => {
    setChartData(data);
  }, [data]);

  // Calculate chart color based on trend
  const isPositive =
    chartData.length > 1 &&
    chartData[chartData.length - 1].value >= chartData[0].value;

  const chartColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";

  if (isLoading) {
    return (
      <div className="w-full h-[250px] sm:h-[300px] flex items-center justify-center bg-card rounded-lg border border-border">
        <div className="animate-pulse text-muted-foreground">Loading chart...</div>
      </div>
    );
  }

  return (
    <div className="w-full bg-card rounded-lg border border-border p-4">
      {/* Timeframe Toggle */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-border p-1">
          {TIMEFRAME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeframe(option.value)}
              className={cn(
                "px-3 py-1 text-sm font-medium rounded-md transition-colors",
                timeframe === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[250px] sm:h-[300px]">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            No data available. Connect accounts to see your portfolio history.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => formatDate(value, timeframe)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(value) => formatCurrency(value)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColor}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorValue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
