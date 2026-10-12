import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatKRW } from "@/lib/finance/format";
import { monthLabel, summarizeMonth, type Occurrence, type PlannedExpense } from "@/lib/finance/occurrences";
import { OccurrenceSummary } from "./occurrence-row";
import { OverrideControls, PlannedAddForm, PlannedControls } from "./planned-forms";

// 예정지출 탭: 이번 달부터 앞으로의 발생을 달별로 묶어 보여 주고, 행을 눌러 펼쳐서 바꾼다.
//  - 고정지출 발생: 이 달만 금액 변경·건너뛰기(덮어쓰기), 이후 모두 변경은 정의 수정 화면으로.
//  - 예정·일회성: 금액·날짜·이름·분류 수정(묶음 전체 가능), 납부 처리·건너뛰기, 삭제.
//  - 화면 길이: 추가 폼은 「+ 예정지출 추가」로 접어 두고, 이번 달만 펼친다. 「예정·일회성만 보기」는 CSS(:has)로 고정지출 행만 감춘다
//    (서버 요청·자바스크립트 없음, globals.css 의 .planned-board 규칙).
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
    <div className="planned-board flex flex-col gap-4">
      <details className="group/add rounded-lg border border-line bg-surface shadow-card">
        <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand">
            <Plus aria-hidden="true" className="size-4 transition-transform group-open/add:rotate-45" />
            예정지출 추가
          </span>
          <span className="text-sm text-muted">할부·분납·일회성 지출을 적어 두면 그 달 합계에 함께 들어갑니다.</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:px-5">
          <p className="text-xs text-muted">분할을 2 이상으로 하면 같은 금액·같은 날짜로 매달 만들어 한 묶음으로 관리합니다.</p>
          <p className="text-xs text-muted">요약 공유 링크에는 이번 달(또는 선택한 기간)의 예정·일회성 지출이 함께 보입니다. 이미 만든 링크에도 추가·변경이 바로 반영됩니다.</p>
          <PlannedAddForm today={today} />
        </div>
      </details>
      <p className="text-sm text-muted">
        <Link href="/app/import/photo" className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-4 hover:underline">
          사진으로 추가
        </Link>{" "}
        — 카드 명세서·영수증 사진에서 할부·일회성 지출을 읽어 한 번에 넣습니다.
      </p>

      {planned.length === 0 ? (
        <p role="note" className="rounded-lg border border-dashed border-line-strong bg-surface-2 px-4 py-4 text-sm text-muted sm:px-5">
          아직 예정·일회성 지출이 없습니다. 위의 「예정지출 추가」로 할부·세금 분납처럼 정해진 달에만 나가는 돈을 적어 두면, 아래 달별 목록에 고정지출과 함께 나뉘어 보입니다.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">달을 누르면 펼치고, 항목을 누르면 그 달만 바꿀 수 있습니다.</p>
        <Switch id="only-planned" label="예정·일회성만 보기" className="min-h-11" />
      </div>

      {months.map(({ month, occurrences }, index) => {
        const s = summarizeMonth(occurrences, month, today);
        const plannedCount = occurrences.filter((o) => o.kind === "planned").length;
        return (
          <details key={month} open={index === 0} className="group/month rounded-lg border border-line bg-surface shadow-card">
            <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 font-semibold">
                <ChevronDown aria-hidden="true" className="size-4 -rotate-90 text-muted transition-transform group-open/month:rotate-0" />
                {monthLabel(month)}
                <span className="num text-xs font-normal text-muted">
                  {occurrences.length}건{plannedCount > 0 ? ` · 예정 ${plannedCount}건` : ""}
                </span>
              </span>
              <span className="num text-sm">
                <span className="text-muted">고정 {formatKRW(s.fixedTotal)} · 예정 {formatKRW(s.plannedTotal)} · </span>
                <span className="font-semibold">합계 {formatKRW(s.total)}</span>
              </span>
            </summary>
            {occurrences.length === 0 ? (
              <p className="border-t border-line px-5 py-6 text-center text-sm text-muted">이 달에 예정된 지출이 없습니다.</p>
            ) : (
              <>
                {plannedCount === 0 ? (
                  <p data-only-planned-empty className="hidden border-t border-line px-5 py-6 text-center text-sm text-muted">
                    이 달에는 예정·일회성 지출이 없습니다.
                  </p>
                ) : null}
                <ol className="flex flex-col divide-y divide-line border-t border-line text-sm">
                  {occurrences.map((o) => {
                    const p = o.kind === "planned" ? byId.get(o.id) : undefined;
                    return (
                      <li key={`${o.kind}-${o.id}`} data-kind={o.kind}>
                        <details className="group/row">
                          <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5 [&::-webkit-details-marker]:hidden">
                            <OccurrenceSummary o={o} />
                            <span className="mt-0.5 inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-line px-2 text-xs font-semibold text-brand group-open/row:bg-brand-soft">
                              바꾸기
                              <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open/row:rotate-180" />
                            </span>
                          </summary>
                          <div className="mx-4 mb-3 rounded-md bg-surface-2 p-3 sm:mx-5">
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
              </>
            )}
          </details>
        );
      })}
    </div>
  );
}
