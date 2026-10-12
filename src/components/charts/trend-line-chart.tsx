"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatKRW, formatKRWShort } from "@/lib/finance/format";
import { AXIS_TICK, DETAILS_SUMMARY_CLASS, TOOLTIP_STYLE } from "./chart-parts";

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
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4" />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} tickMargin={8} tick={AXIS_TICK} />
            <YAxis tickLine={false} axisLine={false} width={60} tick={AXIS_TICK} tickFormatter={(v) => formatKRWShort(Number(v))} />
            <Tooltip formatter={(value) => formatKRW(Number(value))} cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }} {...TOOLTIP_STYLE} />
            <Line
              type="monotone"
              dataKey="netWorth"
              name="순자산"
              stroke="var(--chart-1)"
              strokeWidth={2.25}
              dot={{ r: 3, fill: "var(--surface)", stroke: "var(--chart-1)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="border-t border-line pt-1 text-sm">
        <summary className={DETAILS_SUMMARY_CLASS}>표로 보기</summary>
        <div className="mt-2 overflow-x-auto rounded-md border border-line">
        <table className="w-full border-collapse text-xs tabular-nums">
          <caption className="sr-only">월별 순자산</caption>
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th scope="col" className="px-2.5 py-1.5">월</th>
              <th scope="col" className="px-2.5 py-1.5 text-right">자산</th>
              <th scope="col" className="px-2.5 py-1.5 text-right">부채</th>
              <th scope="col" className="px-2.5 py-1.5 text-right">순자산</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-t border-line">
                <th scope="row" className="px-2.5 py-1.5 text-left font-medium">
                  {p.month}
                </th>
                <td className="px-2.5 py-1.5 text-right">{formatKRW(p.assets)}</td>
                <td className="px-2.5 py-1.5 text-right">{formatKRW(p.liabilities)}</td>
                <td className="px-2.5 py-1.5 text-right font-semibold">{formatKRW(p.netWorth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
    </div>
  );
}
