import { Badge } from "@/components/ui/badge";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance/types";
import type { Occurrence, OccurrenceState } from "@/lib/finance/occurrences";
import { cn } from "@/lib/utils";

export const STATE_LABEL: Record<OccurrenceState, string> = { paid: "납부 완료", due: "남음", planned: "예정", skipped: "건너뜀" };
const STATE_TONE = { paid: "positive", due: "warn", planned: "info", skipped: "neutral" } as const;

// 발생 한 줄의 공통 표시: 이름 · 종류(예정) · 분류 · 상태 · 날짜 · 금액(덮어쓰기면 원래 금액을 함께). <summary> 안에도 들어가도록 span 만 쓴다.
export function OccurrenceSummary({ o, showState = true }: { o: Occurrence; showState?: boolean }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("font-semibold text-ink", o.skipped && "text-muted line-through")}>{o.name}</span>
          {o.kind === "planned" ? <Badge tone="brand">{o.total ? `예정 ${o.seq}/${o.total}회` : "예정·일회성"}</Badge> : null}
          <Badge>{EXPENSE_CATEGORY_LABELS[o.category]}</Badge>
          {showState ? <Badge tone={STATE_TONE[o.state]}>{STATE_LABEL[o.state]}</Badge> : null}
          {o.overridden && !o.skipped ? <Badge tone="warn">이 달만 변경</Badge> : null}
        </span>
        <span className="num text-xs text-muted">{o.date ? formatDate(o.date) : "납부일 미정"}</span>
      </span>
      <span className="num flex shrink-0 flex-col items-end pt-0.5 text-right">
        <span className={cn("text-[0.95rem] font-semibold tracking-[-0.01em] text-ink", o.skipped && "text-muted line-through")}>{formatKRW(o.amount)}</span>
        {o.overridden && o.amount !== o.baseAmount ? <span className="text-xs text-muted line-through">{formatKRW(o.baseAmount)}</span> : null}
      </span>
    </>
  );
}
