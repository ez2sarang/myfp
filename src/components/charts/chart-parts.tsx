import { formatKRW, formatKRWShort } from "@/lib/finance/format";

// 차트 공통 조각 (서버·클라이언트 양쪽에서 쓴다).
export function formatValue(value: number): string {
  return formatKRW(value);
}

export function formatAxis(value: number): string {
  return formatKRWShort(value);
}

export function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
      {text}
    </div>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block size-3 shrink-0 rounded-sm" style={{ background: color }} />;
}
