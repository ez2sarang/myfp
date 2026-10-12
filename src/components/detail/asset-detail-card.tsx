import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { SORT_LABELS, type AssetDetails, type AssetSort } from "@/lib/finance/detail-list";
import { cn } from "@/lib/utils";
import { ListControls } from "./list-controls";

// 자산 세부 항목 카드 (자산 구성 도넛 옆). 서버에서 정렬·필터·가림을 마친 데이터만 받는다.
// fill: 넓은 화면에서 옆 카드(도넛)와 같은 높이로 맞추고 목록만 안에서 스크롤한다 (2열 격자 안에서만 쓴다).
export function AssetDetailCard({
  details,
  action,
  prefix = "",
  sorts,
  keep,
  className,
  fill = false,
}: {
  details: AssetDetails;
  action: string;
  prefix?: string;
  sorts: readonly AssetSort[];
  keep?: Record<string, string>;
  className?: string;
  fill?: boolean;
}) {
  const selected = details.categories.find((c) => c.key === details.query.cat)?.label ?? "전체";
  return (
    <Card id={`${prefix}detail-assets`} className={cn("flex scroll-mt-28 flex-col", fill && "lg:h-0 lg:min-h-full", className)}>
      <CardHeader className="flex-row items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>자산 세부 항목</CardTitle>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{selected}</span> · <span className="num">{details.count}건</span>
          </p>
        </div>
        {details.total !== null ? (
          <p className="flex shrink-0 flex-col items-end text-right">
            <span className="text-xs text-muted">합계</span>
            <span className="num text-xl font-semibold tracking-[-0.02em]">{formatKRW(details.total)}</span>
          </p>
        ) : null}
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-1">
        <ListControls
          action={action}
          prefix={prefix}
          sorts={sorts.map((s) => ({ key: s, label: SORT_LABELS[s] }))}
          query={details.query}
          categories={details.categories}
          keep={keep}
          label="자산 세부 항목"
        />
        {details.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">보여 줄 자산이 없습니다.</p>
        ) : (
          <ol
            tabIndex={0}
            aria-label="자산 세부 항목 목록"
            className={cn(
              "-mx-2 flex max-h-[360px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto overscroll-contain px-2 text-sm",
              fill && "lg:max-h-none",
            )}
          >
            {details.rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-ink">{r.name}</span>
                    <Badge>{r.categoryLabel}</Badge>
                  </span>
                  <span className="text-xs text-muted">
                    기준일 <span className="num">{formatDate(r.asOf)}</span>
                    {r.note ? ` · ${r.note}` : ""}
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
