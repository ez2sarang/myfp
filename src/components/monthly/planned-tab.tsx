import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKRW } from "@/lib/finance/format";
import { monthLabel, summarizeMonth, type Occurrence, type PlannedExpense } from "@/lib/finance/occurrences";
import { OccurrenceSummary } from "./occurrence-row";
import { OverrideControls, PlannedAddForm, PlannedControls } from "./planned-forms";

// 예정지출 탭: 이번 달부터 앞으로의 발생을 달별로 묶어 보여 주고, 행마다 펼쳐서 바꾼다.
//  - 고정지출 발생: 이 달만 금액 변경·건너뛰기(덮어쓰기), 이후 모두 변경은 정의 수정 화면으로.
//  - 예정·일회성: 금액·날짜·이름·분류 수정(묶음 전체 가능), 납부 처리·건너뛰기, 삭제.
export function PlannedTab({
  months,
  today,
  planned,
}: {
  months: readonly { month: string; occurrences: readonly Occurrence[] }[];
  today: string;
  planned: readonly PlannedExpense[];
}) {
  const byId = new Map(planned.map((p) => [p.id, p]));
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>예정·일회성 지출 추가</CardTitle>
          <p className="text-sm text-muted">할부·세금 분납·일회성 지출처럼 고정지출이 아닌 것을 적어 둡니다. 분할을 2 이상으로 하면 같은 금액·같은 날짜로 매달 만들어 한 묶음으로 관리합니다.</p>
        </CardHeader>
        <CardBody>
          <PlannedAddForm today={today} />
        </CardBody>
      </Card>
      {months.map(({ month, occurrences }, index) => {
        const s = summarizeMonth(occurrences, month, today);
        return (
          <details key={month} open={index < 2} className="rounded-lg border border-line bg-surface shadow-card [&[open]>summary_svg]:rotate-90">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 font-semibold">
                {monthLabel(month)}
                <span className="num text-xs font-normal text-muted">{occurrences.length}건</span>
              </span>
              <span className="num text-sm">
                <span className="text-muted">고정 {formatKRW(s.fixedTotal)} · 예정 {formatKRW(s.plannedTotal)} · </span>
                <span className="font-semibold">합계 {formatKRW(s.total)}</span>
              </span>
            </summary>
            {occurrences.length === 0 ? (
              <p className="border-t border-line px-5 py-6 text-center text-sm text-muted">이 달에 예정된 지출이 없습니다.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line border-t border-line text-sm">
                {occurrences.map((o) => {
                  const p = o.kind === "planned" ? byId.get(o.id) : undefined;
                  return (
                    <li key={`${o.kind}-${o.id}`} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start gap-3">
                        <OccurrenceSummary o={o} />
                      </div>
                      <details className="mt-2">
                        <summary className="inline-flex min-h-9 cursor-pointer items-center text-xs font-semibold text-brand">바꾸기</summary>
                        <div className="mt-2 rounded-md bg-surface-2 p-3">
                          {o.kind === "fixed" ? (
                            <div className="flex flex-col gap-2">
                              <OverrideControls fixedId={o.id} month={month} amount={o.amount} overridden={o.overridden} skipped={o.skipped} />
                              <Link href={`/app/fixed/${o.id}`} className="text-xs font-medium text-brand underline underline-offset-4">
                                이후 모두 변경(고정지출 정의 수정)
                              </Link>
                            </div>
                          ) : p ? (
                            <PlannedControls item={p} />
                          ) : null}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </details>
        );
      })}
    </div>
  );
}
