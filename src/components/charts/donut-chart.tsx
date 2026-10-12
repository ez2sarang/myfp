"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DonutData } from "@/lib/finance/charts";
import { formatKRWShort } from "@/lib/finance/format";
import { EmptyChart, Swatch, formatValue } from "./chart-parts";

// 도넛 + 범례 목록. 그림은 장식(aria-hidden)이고 같은 내용을 범례 목록(이름·값·비중)으로 제공한다.
// percent 모드(금액 숨김)에서는 데이터에 금액이 없고 가운데에도 합계 금액을 쓰지 않는다.
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
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
      <div className="relative mx-auto h-[220px] w-full max-w-[220px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.items}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="96%"
              paddingAngle={1}
              isAnimationActive={false}
              onClick={(_, index) => {
                const key = data.items[index]?.key;
                const href = key && filterHrefs ? filterHrefs[key] : undefined;
                if (href) router.push(href, { scroll: false });
              }}
              className={filterHrefs ? "cursor-pointer" : undefined}
            >
              {data.items.map((d) => (
                <Cell key={d.key} fill={d.color} stroke="var(--surface)" opacity={activeKey && activeKey !== d.key ? 0.35 : 1} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatValue(data.mode, Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted">{centerLabel}</span>
          <span className="num text-lg font-bold">{data.total === null ? "100%" : formatKRWShort(data.total)}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2 text-sm" aria-label={`${centerLabel} 구성`}>
        {data.items.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <Swatch color={d.color} />
            {filterHrefs?.[d.key] ? (
              <Link
                href={filterHrefs[d.key] as string}
                scroll={false}
                aria-current={activeKey === d.key ? "true" : undefined}
                className={`flex-1 underline-offset-4 hover:underline ${activeKey === d.key ? "font-bold" : ""}`}
              >
                {d.label}
              </Link>
            ) : (
              <span className="flex-1">{d.label}</span>
            )}
            {data.mode === "krw" ? <span className="num font-semibold">{formatValue("krw", d.value)}</span> : null}
            <span className="num w-14 text-right text-muted">{d.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
