import { useMemo } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
} from "recharts";
import { parseMoney } from "@/constants/accounts.constants";

interface BalanceSparklineProps {
  data?: number[];
  balance?: string | number;
  color?: string;
  height?: number;
}

export function buildMockTrend(balance: string | number): number[] {
  const numeric = Math.max(parseMoney(balance), 1);
  return Array.from({ length: 7 }, (_, index) => {
    const wave = Math.sin(index + numeric / 997) * 0.025;
    const drift = 0.92 + index * 0.025;
    return Number((numeric * (drift + wave)).toFixed(2));
  });
}

export function BalanceSparkline({
  data,
  balance = 0,
  color = "#10B981",
  height = 80,
}: BalanceSparklineProps) {
  const points = useMemo(() => data ?? buildMockTrend(balance), [balance, data]);
  const chartData = points.map((value, index) => ({ index, value }));

  return (
    <div aria-hidden="true" className="w-full" style={{ height }}>
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={chartData} margin={{ bottom: 4, left: 2, right: 2, top: 4 }}>
          <Line
            dataKey="value"
            dot={false}
            isAnimationActive={false}
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
