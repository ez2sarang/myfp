import type { CSSProperties } from "react";
import { formatKRW, formatKRWShort } from "@/lib/finance/format";

// 차트 공통 조각 (서버·클라이언트 양쪽에서 쓴다).
export function formatValue(value: number): string {
  return formatKRW(value);
}

export function formatAxis(value: number): string {
  return formatKRWShort(value);
}

// 툴팁 겉모양: 색은 모두 토큰(CSS 변수)이라 라이트·다크가 저절로 따라간다.
export const TOOLTIP_STYLE: { contentStyle: CSSProperties; labelStyle: CSSProperties; itemStyle: CSSProperties; wrapperStyle: CSSProperties } = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--line-strong)",
    borderRadius: 10,
    color: "var(--ink)",
    boxShadow: "var(--shadow-raised)",
    fontSize: 12,
    lineHeight: 1.5,
    padding: "8px 12px",
  },
  labelStyle: { color: "var(--muted)", fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: "var(--ink)", padding: 0, fontVariantNumeric: "tabular-nums" },
  wrapperStyle: { outline: "none" },
};

export const AXIS_TICK = { fill: "var(--chart-axis)", fontSize: 11 } as const;

export function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center text-sm text-muted">
      {text}
    </div>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />;
}

// 차트 아래 "표로 보기"의 펼침 단추 모양 (같은 내용을 표로 제공한다).
export const DETAILS_SUMMARY_CLASS =
  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md text-xs font-semibold text-muted transition-colors hover:text-ink sm:min-h-8";
