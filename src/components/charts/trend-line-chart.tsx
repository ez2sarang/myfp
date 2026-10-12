"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatKRW, formatKRWShort } from "@/lib/finance/format";

export interface TrendPoint {
  month: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

// 월별 순자산 추이 선 + 같은 데이터의 표(접어서 제공).
export function TrendLineChart({ points }: { points: TrendPoint[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[220px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} tickFormatter={(v) => formatKRWShort(Number(v))} />
            <Tooltip formatter={(value) => formatKRW(Number(value))} />
            <Line type="monotone" dataKey="netWorth" name="순자산" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-muted">표로 보기</summary>
        <table className="mt-2 w-full border-collapse text-xs tabular-nums">
          <caption className="sr-only">월별 순자산</caption>
          <thead className="text-left text-muted">
            <tr>
              <th scope="col" className="px-2 py-1">월</th>
              <th scope="col" className="px-2 py-1 text-right">자산</th>
              <th scope="col" className="px-2 py-1 text-right">부채</th>
              <th scope="col" className="px-2 py-1 text-right">순자산</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-t border-line">
                <th scope="row" className="px-2 py-1 text-left font-medium">
                  {p.month}
                </th>
                <td className="px-2 py-1 text-right">{formatKRW(p.assets)}</td>
                <td className="px-2 py-1 text-right">{formatKRW(p.liabilities)}</td>
                <td className="px-2 py-1 text-right font-semibold">{formatKRW(p.netWorth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
