"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DonutData } from "@/lib/finance/charts";
import { formatKRWShort } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import { EmptyChart, Swatch, TOOLTIP_STYLE, formatValue } from "./chart-parts";

// 도넛 + 범례 목록. 그림은 장식(aria-hidden)이고 같은 내용을 범례 목록(이름·금액·비중)으로 제공한다.
// 금액을 숨긴 공유 보기에는 이 차트를 쓰지 않는다.
// filterHrefs 를 주면 범례 항목(링크, 키보드로 이동 가능)과 조각 클릭이 그 분류만 보기로 이동한다. activeKey 는 지금 고른 분류.
export function DonutChart({
  data,
  centerLabel,
  emptyText,
  filterHrefs,
  activeKey = null,
}: {
  data: DonutData;
  centerLabel: string;
  emptyText: string;
  filterHrefs?: Record<string, string>;
  activeKey?: string | null;
}) {
  const router = useRouter();
  if (data.items.length === 0) return <EmptyChart text={emptyText} />;
  const active = activeKey ? data.items.find((d) => d.key === activeKey) : undefined;
  return (
    <div className="flex flex-col gap-6">
      <div className="relative mx-auto size-[220px] sm:size-[240px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.items}
              dataKey="value"
              nameKey="label"
              innerRadius="72%"
              outerRadius="100%"
              paddingAngle={data.items.length > 1 ? 2 : 0}
              cornerRadius={3}
              stroke="var(--surface)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              onClick={(_, index) => {
                const key = data.items[index]?.key;
                const href = key && filterHrefs ? filterHrefs[key] : undefined;
                if (href) router.push(href, { scroll: false });
              }}
              className={filterHrefs ? "cursor-pointer" : undefined}
            >
              {data.items.map((d) => (
                <Cell key={d.key} fill={d.color} opacity={activeKey && activeKey !== d.key ? 0.28 : 1} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatValue(Number(value))} {...TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          <span className="text-xs font-medium text-muted">{active ? active.label : centerLabel}</span>
          <span className="num text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
            {formatKRWShort(active ? active.value : data.total)}
          </span>
          <span className="num text-xs text-muted">{active ? `${active.percent}%` : `${data.items.length}개 분류`}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-0.5 text-sm" aria-label={`${centerLabel} 구성`}>
        {data.items.map((d) => {
          const on = activeKey === d.key;
          const dim = Boolean(activeKey) && !on;
          const body = (
            <>
              <span className="flex items-center gap-2.5">
                <Swatch color={d.color} />
                <span className={cn("min-w-0 flex-1 truncate", on ? "font-semibold text-ink" : "font-medium")}>{d.label}</span>
                <span className="num shrink-0 font-semibold tracking-tight">{formatValue(d.value)}</span>
                <span className="num w-11 shrink-0 text-right text-xs text-muted">{d.percent}%</span>
              </span>
              <span aria-hidden="true" className="ml-5 mr-[3.375rem] block h-1 overflow-hidden rounded-full bg-bg-alt">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, d.percent))}%`, background: d.color, opacity: dim ? 0.35 : 1 }}
                />
              </span>
            </>
          );
          const rowClass = cn(
            "flex min-h-11 flex-col justify-center gap-1.5 rounded-md px-2.5 py-2 transition-colors",
            on && "bg-brand-soft",
          );
          return (
            <li key={d.key}>
              {filterHrefs?.[d.key] ? (
                <Link
                  prefetch={false}
                  href={filterHrefs[d.key] as string}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  className={cn(rowClass, on ? "hover:bg-brand-soft" : "hover:bg-bg-alt")}
                >
                  {body}
                </Link>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
