import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { SORT_LABELS, type AssetDetails, type AssetSort } from "@/lib/finance/detail-list";
import { ListControls } from "./list-controls";

// 자산 세부 항목 카드 (자산 구성 도넛 옆). 서버에서 정렬·필터·가림을 마친 데이터만 받는다.
export function AssetDetailCard({
  details,
  action,
  prefix = "",
  sorts,
  keep,
}: {
  details: AssetDetails;
  action: string;
  prefix?: string;
  sorts: readonly AssetSort[];
  keep?: Record<string, string>;
}) {
  const selected = details.categories.find((c) => c.key === details.query.cat)?.label ?? "전체";
  return (
    <Card id={`${prefix}detail-assets`} className="flex scroll-mt-24 flex-col">
      <CardHeader>
        <CardTitle>자산 세부 항목</CardTitle>
        <p className="text-sm text-muted">
          {selected} · {details.count}건{details.total !== null ? ` · ${formatKRW(details.total)}` : ""}
        </p>
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-3">
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
          <p className="text-sm text-muted">보여 줄 자산이 없습니다.</p>
        ) : (
          <ol tabIndex={0} aria-label="자산 세부 항목 목록" className="-mx-1 flex max-h-[360px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto px-1 text-sm">
            {details.rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex items-start justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <Badge>{r.categoryLabel}</Badge>
                  </span>
                  <span className="text-xs text-muted">
                    기준일 {formatDate(r.asOf)}
                    {r.note ? ` · ${r.note}` : ""}
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
