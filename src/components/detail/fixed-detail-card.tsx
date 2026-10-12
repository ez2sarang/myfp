import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { SORT_LABELS, type FixedDetails, type FixedSort } from "@/lib/finance/detail-list";
import { cn } from "@/lib/utils";
import { ListControls } from "./list-controls";

// 다음 납부까지 남은 날 표시 (오늘·사흘 안은 코발트로 강조). 날짜가 없으면 같은 폭의 빈 칸.
export function DayPill({ daysLeft, className }: { daysLeft: number | null | undefined; className?: string }) {
  if (daysLeft === null || daysLeft === undefined) {
    return <span aria-hidden="true" className={cn("w-14 shrink-0", className)} />;
  }
  return (
    <span
      className={cn(
        "num inline-flex h-7 w-14 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-tight",
        daysLeft === 0 ? "bg-btn text-btn-ink" : daysLeft <= 3 ? "bg-brand-soft text-brand" : "bg-bg-alt text-muted",
        className,
      )}
    >
      {daysLeft === 0 ? "오늘" : `D-${daysLeft}`}
    </span>
  );
}

// 고정지출 세부 항목 카드: 머리(선택 분류 합계) + 정렬·필터 + 내부 스크롤 목록. 데이터는 서버에서 정렬·필터·가림을 마친 것이다.
// fill: 넓은 화면에서 옆 카드(도넛)와 같은 높이로 맞추고 목록만 안에서 스크롤한다 (2열 격자 안에서만 쓴다).
export function FixedDetailCard({
  details,
  action,
  sorts,
  keep,
  className,
  fill = false,
}: {
  details: FixedDetails;
  action: string;
  sorts: readonly FixedSort[];
  keep?: Record<string, string>;
  className?: string;
  fill?: boolean;
}) {
  const selected = details.categories.find((c) => c.key === details.query.cat)?.label ?? "전체";
  return (
    <Card id="detail-list" className={cn("flex scroll-mt-28 flex-col", fill && "lg:h-0 lg:min-h-full", className)}>
      <CardHeader className="flex-row items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>세부 항목</CardTitle>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{selected}</span> · <span className="num">{details.count}건</span>
          </p>
        </div>
        {details.monthlyTotal !== null ? (
          <p className="flex shrink-0 flex-col items-end text-right">
            <span className="text-xs text-muted">월 합계</span>
            <span className="num text-xl font-semibold tracking-[-0.02em]">{formatKRW(details.monthlyTotal)}</span>
          </p>
        ) : null}
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-1">
        <ListControls
          action={action}
          sorts={sorts.map((s) => ({ key: s, label: SORT_LABELS[s] }))}
          query={details.query}
          categories={details.categories}
          keep={keep}
          label="세부 항목"
        />
        {details.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">보여 줄 항목이 없습니다.</p>
        ) : (
          <ol
            tabIndex={0}
            aria-label="세부 항목 목록"
            className={cn(
              "-mx-2 flex max-h-[420px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto overscroll-contain px-2 text-sm",
              fill && "lg:max-h-none",
            )}
          >
            {details.rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex items-start gap-3 py-3">
                <DayPill daysLeft={r.nextDate ? r.daysLeft : null} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-ink">{r.name}</span>
                    <Badge>{r.categoryLabel}</Badge>
                  </span>
                  <span className="text-xs text-muted">
                    {r.schedule}
                    {r.nextDate ? <span className="num"> · 다음 {formatDate(r.nextDate)}</span> : null}
                    {r.paymentMethod || r.institution ? ` · ${[r.paymentMethod, r.institution].filter(Boolean).join(" ")}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {r.endDate ? `종료 ${formatDate(r.endDate)}${r.remainingCount !== null ? ` · ${r.remainingCount}회 남음` : ""}` : "종료일 없음"}
                  </span>
                </div>
                {r.amount !== null ? (
                  <span className="num shrink-0 pt-0.5 text-right text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{formatKRW(r.amount)}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
