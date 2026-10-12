import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { SORT_LABELS, type FixedDetails, type FixedSort } from "@/lib/finance/detail-list";
import { ListControls } from "./list-controls";

// 고정지출 세부 항목 카드: 머리(선택 분류 합계) + 정렬·필터 + 내부 스크롤 목록. 데이터는 서버에서 정렬·필터·가림을 마친 것이다.
export function FixedDetailCard({
  details,
  action,
  sorts,
  keep,
  className,
}: {
  details: FixedDetails;
  action: string;
  sorts: readonly FixedSort[];
  keep?: Record<string, string>;
  className?: string;
}) {
  const selected = details.categories.find((c) => c.key === details.query.cat)?.label ?? "전체";
  return (
    <Card id="detail-list" className={`flex scroll-mt-24 flex-col ${className ?? ""}`}>
      <CardHeader>
        <CardTitle>세부 항목</CardTitle>
        <p className="text-sm text-muted">
          {selected} · {details.count}건{details.monthlyTotal !== null ? ` · 월 ${formatKRW(details.monthlyTotal)}` : ""}
        </p>
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-3">
        <ListControls
          action={action}
          sorts={sorts.map((s) => ({ key: s, label: SORT_LABELS[s] }))}
          query={details.query}
          categories={details.categories}
          keep={keep}
          label="세부 항목"
        />
        {details.rows.length === 0 ? (
          <p className="text-sm text-muted">보여 줄 항목이 없습니다.</p>
        ) : (
          <ol
            tabIndex={0}
            aria-label="세부 항목 목록"
            className="-mx-1 flex max-h-[420px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto px-1 text-sm"
          >
            {details.rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <Badge>{r.categoryLabel}</Badge>
                  </span>
                  <span className="text-xs text-muted">
                    {r.schedule}
                    {r.nextDate ? ` · ${r.daysLeft === 0 ? "오늘" : `D-${r.daysLeft}`} (${formatDate(r.nextDate)})` : ""}
                    {r.paymentMethod || r.institution ? ` · ${[r.paymentMethod, r.institution].filter(Boolean).join(" ")}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {r.endDate ? `종료 ${formatDate(r.endDate)}${r.remainingCount !== null ? ` · ${r.remainingCount}회 남음` : ""}` : "종료일 없음"}
                  </span>
                </div>
                {r.amount !== null ? <span className="num shrink-0 font-semibold">{formatKRW(r.amount)}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
