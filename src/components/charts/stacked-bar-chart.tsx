"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StackData } from "@/lib/finance/charts";
import { AXIS_TICK, DETAILS_SUMMARY_CLASS, EmptyChart, Swatch, TOOLTIP_STYLE, formatAxis, formatValue } from "./chart-parts";

// 월별 누적 막대 + 범례 + 같은 데이터의 표(접어서 제공, 화면 낭독기·인쇄용).
export function StackedBarChart({ data, title, emptyText }: { data: StackData; title: string; emptyText: string }) {
  if (data.series.length === 0 || data.rows.every((r) => r.total === 0)) return <EmptyChart text={emptyText} />;
  const rows = data.rows.map((r) => ({ label: r.label, ...r.values }));
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[240px] sm:h-[280px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: -4 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} tickMargin={8} tick={AXIS_TICK} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} width={60} tick={AXIS_TICK} tickFormatter={(v) => formatAxis(Number(v))} />
            <Tooltip formatter={(value) => formatValue(Number(value))} cursor={{ fill: "var(--brand-soft)" }} {...TOOLTIP_STYLE} />
            {data.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="total"
                fill={s.color}
                maxBarSize={40}
                radius={i === data.series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-hidden="true">
        {data.series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 font-medium">
            <Swatch color={s.color} />
            {s.label}
          </li>
        ))}
      </ul>
      <details className="border-t border-line pt-1 text-sm">
        <summary className={DETAILS_SUMMARY_CLASS}>표로 보기</summary>
        <div className="mt-2 overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-xs tabular-nums">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th scope="col" className="px-2.5 py-1.5">월</th>
                <th scope="col" className="px-2.5 py-1.5 text-right">합계</th>
                {data.series.map((s) => (
                  <th key={s.key} scope="col" className="px-2.5 py-1.5 text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.month} className="border-t border-line">
                  <th scope="row" className="px-2.5 py-1.5 text-left font-medium">
                    {r.month}
                  </th>
                  <td className="px-2.5 py-1.5 text-right font-semibold">{formatValue(r.total)}</td>
                  {data.series.map((s) => (
                    <td key={s.key} className="px-2.5 py-1.5 text-right">
                      {formatValue(r.values[s.key] ?? 0)}
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
