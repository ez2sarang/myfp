"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompareData } from "@/lib/finance/charts";
import { EmptyChart, Swatch, TOOLTIP_STYLE, formatAxis, formatValue } from "./chart-parts";

// 가로 막대 비교(자산 vs 부채) + 같은 값의 목록.
export function CompareBarChart({ data, emptyText }: { data: CompareData; emptyText: string }) {
  if (data.items.every((d) => d.value === 0)) return <EmptyChart text={emptyText} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[140px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.items} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
            <XAxis type="number" hide tickFormatter={(v) => formatAxis(Number(v))} />
            <YAxis type="category" dataKey="label" width={44} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 12, fontWeight: 600 }} />
            <Tooltip formatter={(value) => formatValue(Number(value))} cursor={{ fill: "var(--brand-soft)" }} {...TOOLTIP_STYLE} />
            <Bar dataKey="value" name="합계" radius={[0, 6, 6, 0]} maxBarSize={30} background={{ fill: "var(--bg-alt)", radius: 6 }} isAnimationActive={false}>
              {data.items.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col divide-y divide-line border-t border-line text-sm">
        {data.items.map((d) => (
          <li key={d.key} className="flex items-center gap-2.5 py-2">
            <Swatch color={d.color} />
            <span className="flex-1 font-medium">{d.label}</span>
            <span className="num font-semibold tracking-tight">{formatValue(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
