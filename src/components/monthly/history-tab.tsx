import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import type { StackData } from "@/lib/finance/charts";
import { formatKRW } from "@/lib/finance/format";
import { monthLabel, summarizeMonth, type Occurrence } from "@/lib/finance/occurrences";
import { OccurrenceSummary } from "./occurrence-row";

// 내역 탭: 월별 추이(과거 6개월 ~ 이번 달 ~ 이후 6개월) + 지난 달 목록(최근 달부터). 달을 펼치면 발생 목록과 분류 합계.
export function HistoryTab({ trend, past, today }: { trend: StackData; past: readonly { month: string; occurrences: readonly Occurrence[] }[]; today: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>월별 추이</CardTitle>
          <p className="text-sm text-muted">과거 6개월부터 이후 6개월까지. 고정지출(달별 변경 반영)과 예정·일회성을 나눠 쌓습니다. 건너뛴 지출은 빠집니다.</p>
        </CardHeader>
        <CardBody>
          <StackedBarChart data={trend} title="월별 지출 추이" emptyText="표시할 지출이 없습니다." />
        </CardBody>
      </Card>
      {past.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-5 py-8 text-center text-sm text-muted">지난 달 기록이 아직 없습니다.</p>
      ) : (
        past.map(({ month, occurrences }) => {
          const s = summarizeMonth(occurrences, month, today);
          return (
            <details key={month} className="rounded-lg border border-line bg-surface shadow-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 font-semibold">
                  {monthLabel(month)}
                  <span className="num text-xs font-normal text-muted">{occurrences.length - s.skippedCount}건 납부</span>
                </span>
                <span className="num text-sm">
                  <span className="text-muted">고정 {formatKRW(s.fixedTotal)} · 예정 {formatKRW(s.plannedTotal)} · </span>
                  <span className="font-semibold">합계 {formatKRW(s.total)}</span>
                </span>
              </summary>
              <div className="grid gap-4 border-t border-line p-4 sm:p-5 lg:grid-cols-[2fr_1fr]">
                <ol className="flex flex-col divide-y divide-line text-sm">
                  {occurrences.map((o) => (
                    <li key={`${o.kind}-${o.id}`} className="flex items-start gap-3 py-2.5">
                      <OccurrenceSummary o={o} showState={o.skipped} />
                    </li>
                  ))}
                </ol>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">분류별 합계</h3>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                    {s.byCategory.map((c) => (
                      <div key={c.category} className="contents">
                        <dt className="text-muted">
                          {c.label} <span className="num text-xs">({c.count})</span>
                        </dt>
                        <dd className="num text-right font-medium">{formatKRW(c.amount)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </details>
          );
        })
      )}
    </div>
  );
}
