import { ListControls } from "@/components/detail/list-controls";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { SORT_LABELS, type FixedSort } from "@/lib/finance/detail-list";
import { formatKRW } from "@/lib/finance/format";
import type { OccurrenceDetails } from "@/lib/finance/occurrences";
import { cn } from "@/lib/utils";
import { OccurrenceSummary } from "./occurrence-row";

// 선택한 달의 세부 항목: 고정지출 발생 + 예정·일회성. 정렬·분류 필터는 URL 쿼리(서버에서 검증·정렬).
export function MonthDetailCard({
  details,
  sorts,
  keep,
  fill = false,
}: {
  details: OccurrenceDetails;
  sorts: readonly FixedSort[];
  keep: Record<string, string>;
  fill?: boolean;
}) {
  const selected = details.categories.find((c) => c.key === details.query.cat)?.label ?? "전체";
  return (
    <Card id="detail-list" className={cn("flex scroll-mt-28 flex-col", fill && "lg:h-0 lg:min-h-full")}>
      <CardHeader className="flex-row items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>세부 항목</CardTitle>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{selected}</span> · <span className="num">{details.count}건</span>
          </p>
        </div>
        <p className="flex shrink-0 flex-col items-end text-right">
          <span className="text-xs text-muted">합계(건너뜀 제외)</span>
          <span className="num text-xl font-semibold tracking-[-0.02em]">{formatKRW(details.total)}</span>
        </p>
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-1">
        <ListControls
          action="/app#detail-list"
          sorts={sorts.map((s) => ({ key: s, label: SORT_LABELS[s] }))}
          query={details.query}
          categories={details.categories}
          keep={keep}
          label="세부 항목"
        />
        {details.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">이 달에 보여 줄 항목이 없습니다.</p>
        ) : (
          <ol
            tabIndex={0}
            aria-label="세부 항목 목록"
            className={cn("-mx-2 flex max-h-[420px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto overscroll-contain px-2 text-sm", fill && "lg:max-h-none")}
          >
            {details.rows.map((o) => (
              <li key={`${o.kind}-${o.id}`} className="flex items-start gap-3 py-3">
                <OccurrenceSummary o={o} />
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
