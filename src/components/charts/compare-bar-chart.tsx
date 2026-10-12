"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompareData } from "@/lib/finance/charts";
import { EmptyChart, Swatch, formatAxis, formatValue } from "./chart-parts";

// 가로 막대 비교(자산 vs 부채) + 같은 값의 목록.
export function CompareBarChart({ data, emptyText }: { data: CompareData; emptyText: string }) {
  if (data.items.every((d) => d.value === 0)) return <EmptyChart text={emptyText} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[140px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.items} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
            <XAxis type="number" hide tickFormatter={(v) => formatAxis(data.mode, Number(v))} />
            <YAxis type="category" dataKey="label" width={44} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 13 }} />
            <Tooltip formatter={(value) => formatValue(data.mode, Number(value))} cursor={{ fill: "var(--chart-grid)" }} />
            <Bar dataKey="value" name="합계" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {data.items.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {data.items.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <Swatch color={d.color} />
            <span className="flex-1">{d.label}</span>
            <span className="num font-semibold">{formatValue(data.mode, d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
