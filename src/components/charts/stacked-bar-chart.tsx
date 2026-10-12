"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StackData } from "@/lib/finance/charts";
import { EmptyChart, Swatch, formatAxis, formatValue } from "./chart-parts";

// 월별 누적 막대 + 범례 + 같은 데이터의 표(접어서 제공, 화면 낭독기·인쇄용).
export function StackedBarChart({ data, title, emptyText }: { data: StackData; title: string; emptyText: string }) {
  if (data.series.length === 0 || data.rows.every((r) => r.total === 0)) return <EmptyChart text={emptyText} />;
  const rows = data.rows.map((r) => ({ label: r.label, ...r.values }));
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[260px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} tickFormatter={(v) => formatAxis(data.mode, Number(v))} />
            <Tooltip formatter={(value) => formatValue(data.mode, Number(value))} cursor={{ fill: "var(--chart-grid)" }} />
            {data.series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="total" fill={s.color} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
        {data.series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <Swatch color={s.color} />
            {s.label}
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-muted">표로 보기</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <caption className="sr-only">{title}</caption>
            <thead className="text-left text-muted">
              <tr>
                <th scope="col" className="px-2 py-1">월</th>
                <th scope="col" className="px-2 py-1 text-right">합계</th>
                {data.series.map((s) => (
                  <th key={s.key} scope="col" className="px-2 py-1 text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.month} className="border-t border-line">
                  <th scope="row" className="px-2 py-1 text-left font-medium">
                    {r.month}
                  </th>
                  <td className="px-2 py-1 text-right font-semibold">{formatValue(data.mode, r.total)}</td>
                  {data.series.map((s) => (
                    <td key={s.key} className="px-2 py-1 text-right">
                      {formatValue(data.mode, r.values[s.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
