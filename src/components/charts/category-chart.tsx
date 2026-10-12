"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatKRW } from "@/lib/finance/format";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)"];

export interface CategoryDatum {
  label: string;
  monthly: number;
}

// 분류별 월 고정지출 비중 도넛. 같은 내용을 옆의 표(범례)로도 보여 주므로 차트 자체는 장식(aria-hidden)이다.
export function CategoryChart({ data }: { data: CategoryDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.monthly, 0);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
      <div className="h-[200px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="monthly" nameKey="label" innerRadius="58%" outerRadius="95%" paddingAngle={1} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.label} fill={COLORS[i % COLORS.length]} stroke="var(--surface)" />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatKRW(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1">{d.label}</span>
            <span className="num font-semibold">{formatKRW(d.monthly)}</span>
            <span className="num w-12 text-right text-muted">{total > 0 ? `${Math.round((d.monthly / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
