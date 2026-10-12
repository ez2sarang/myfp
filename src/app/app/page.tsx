import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarDays, Plus, Receipt, Wallet } from "lucide-react";
import { DisplayNameHint } from "@/components/app-shell/display-name-hint";
import { PageHeader } from "@/components/app-shell/page-header";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { DayPill, FixedDetailCard } from "@/components/detail/fixed-detail-card";
import { Stat } from "@/components/shared/stat";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db/pool";
import { listBalances } from "@/lib/db/queries/balance";
import { listFixed } from "@/lib/db/queries/fixed";
import { getDisplayName } from "@/lib/db/queries/users";
import { categoryDonut, projectionStack } from "@/lib/finance/charts";
import { seoulToday } from "@/lib/finance/dates";
import { FIXED_SORTS, defaultFixedSort, fixedDetails, listHref, parseListQuery, type FixedSort } from "@/lib/finance/detail-list";
import { EXPENSE_CATEGORIES } from "@/lib/finance/types";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { upcomingPayments } from "@/lib/finance/schedule";
import { debtTimeline, summarizeBalances, summarizeFixed, windowLastDay } from "@/lib/finance/summary";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "대시보드" };

// 첫 화면: 큰 숫자 요약 → 분류 도넛 + 세부 항목(정렬·분류 필터, URL 쿼리 sort·dir·cat) → 12개월 누적 막대 → 30일 일정 → 상환 타임라인.
// 데이터 가공·정렬·필터는 모두 서버에서 하고 차트 컴포넌트에는 숫자만 넘긴다.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireActiveUser("/app");
  const query = parseListQuery<FixedSort>(await searchParams, { sorts: FIXED_SORTS, defaultSort: defaultFixedSort(), categories: EXPENSE_CATEGORIES });
  // 표시 이름 안내는 공급자 이름이 없을 때만 확인한다
  const [fixed, balances, displayName] = await Promise.all([
    listFixed(db, viewer.id),
    listBalances(db, viewer.id),
    viewer.name === null ? getDisplayName(db, viewer.id) : Promise.resolve(viewer.name),
  ]);
  const today = seoulToday();
  const summary = summarizeFixed(fixed, today);
  const totals = summarizeBalances(balances);
  const debts = debtTimeline(fixed, balances, today);
  const next = upcomingPayments(fixed, today, 366)[0];
  const donut = categoryDonut(summary.byCategory);
  const projection = projectionStack(fixed, today, 12);
  const empty = fixed.length === 0 && balances.length === 0;
  const details = fixedDetails(fixed, today, query);
  const filterHrefs = Object.fromEntries(
    donut.items.map((d) => [d.key, listHref("/app", "", { sort: details.query.sort, dir: details.query.dir, cat: d.key }, {}, "#detail-list")]),
  );
  // 화면 표시용 "YYYY년 M월" (today 는 YYYY-MM-DD)
  const [year, month] = today.split("-");
  const monthLabel = `${year}년 ${Number(month)}월`;

  return (
    <>
      <PageHeader eyebrow={`이번 달 · ${monthLabel}`} title="대시보드" description={`${formatDate(today)} 기준 (서울 시간)`} />
      {viewer.name === null && displayName === null ? <DisplayNameHint /> : null}
      {empty ? (
        <div
          role="note"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-info-bg px-4 py-3 text-sm text-info-ink sm:px-5"
        >
          <span>아직 등록한 항목이 없습니다. 고정지출을 추가하면 합계·차트·일정이 자동으로 계산됩니다.</span>
          <Link href="/app/fixed#add-fixed" className={buttonClass("primary", "sm", "min-h-11 sm:min-h-9")}>
            <Plus aria-hidden="true" className="size-4" />
            고정지출 추가하기
          </Link>
        </div>
      ) : null}

      <section aria-label="이번 달 요약" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          accent
          icon={<Receipt />}
          label="월 고정지출"
          value={formatKRW(summary.monthlyTotal)}
          hint={`활성 ${summary.activeCount}건 · 연 주기는 12로 나눔`}
        />
        <Stat
          icon={<CalendarClock />}
          label="이번 달 남은 납부액"
          value={formatKRW(summary.remainingThisMonth)}
          hint={`오늘부터 이달 말까지 ${summary.remainingThisMonthCount}건`}
        />
        <Stat
          icon={<CalendarDays />}
          label="다음 납부"
          value={next ? (next.daysLeft === 0 ? "오늘" : `D-${next.daysLeft}`) : "—"}
          hint={next ? `${formatDate(next.date)} · ${next.item.name} · ${formatKRW(next.item.amount)}` : "납부일이 있는 활성 항목이 없습니다"}
        />
        <Stat
          icon={<Wallet />}
          label="순자산"
          value={formatKRW(totals.netWorth)}
          hint={`자산 ${formatKRW(totals.assetsTotal)} − 부채 ${formatKRW(totals.liabilitiesTotal)}`}
          tone={totals.netWorth < 0 ? "negative" : "default"}
        />
      </section>

      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="shadow-raised lg:min-h-[36rem]">
          <CardHeader>
            <CardTitle>분류별 월 고정지출</CardTitle>
            <p className="text-sm text-muted">분류를 누르면 오른쪽 목록이 그 분류만 보여 줍니다.</p>
          </CardHeader>
          <CardBody className="pt-6">
            <DonutChart data={donut} centerLabel="월 합계" emptyText="활성 고정지출이 없습니다." filterHrefs={filterHrefs} activeKey={details.query.cat} />
          </CardBody>
        </Card>
        <FixedDetailCard details={details} action="/app#detail-list" sorts={FIXED_SORTS} fill />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>향후 12개월 예상 지출</CardTitle>
            <p className="text-sm text-muted">이번 달부터. 종료일이 지난 항목은 그 달부터 빠집니다.</p>
          </div>
          <Badge tone="brand">{monthLabel}부터</Badge>
        </CardHeader>
        <CardBody>
          <StackedBarChart data={projection} title="향후 12개월 월별 예상 지출" emptyText="예상 지출이 없습니다." />
        </CardBody>
      </Card>

      {/* 상환 표는 열이 많아 넓은 화면(xl)에서만 옆에 두고, 그보다 좁으면 아래로 내려 숫자가 잘리지 않게 한다. */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>다음 30일 납부 일정</CardTitle>
              <p className="text-sm text-muted">{formatDate(windowLastDay(today))}까지</p>
            </div>
            <p className="flex flex-col items-end text-right">
              <span className="num text-xs text-muted">{summary.upcoming.length}건</span>
              <span className="num text-lg font-semibold tracking-[-0.02em]">{formatKRW(summary.upcomingTotal)}</span>
            </p>
          </CardHeader>
          <CardBody>
            {summary.upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">30일 안에 예정된 납부가 없습니다. 납부일이 비어 있는 항목은 일정에 나오지 않습니다.</p>
            ) : (
              <ol className="-my-1 flex flex-col divide-y divide-line text-sm">
                {summary.upcoming.map((u, i) => (
                  <li key={`${u.id}-${u.date}-${i}`} className="flex items-center gap-3 py-2.5">
                    <DayPill daysLeft={u.daysLeft} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{u.name}</span>
                      <span className="num text-xs text-muted">{formatDate(u.date)}</span>
                    </span>
                    <span className="num shrink-0 text-right font-semibold tracking-[-0.01em]">{formatKRW(u.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>부채 상환 타임라인</CardTitle>
            <p className="text-sm text-muted">대출 상환·이자 분류의 고정지출과 종료일이 있는 부채. 남은 총액은 남은 횟수 × 금액의 추정치입니다.</p>
          </CardHeader>
          <CardBody>
            {debts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">상환 중인 항목이 없습니다.</p>
            ) : (
              <>
              {/* 좁은 화면: 표 대신 항목별 카드(숫자는 오른쪽 정렬, 줄바꿈 없음) */}
              <ul aria-label="부채 상환 타임라인" className="-my-1 flex flex-col divide-y divide-line text-sm md:hidden">
                {debts.map((d) => (
                  <li key={`${d.kind}-${d.id}`} className="flex flex-col gap-2 py-3">
                    <span className="font-semibold">{d.name}</span>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
                      <dt className="text-muted">종료일</dt>
                      <dd className="num whitespace-nowrap text-right">{d.endDate ? formatDate(d.endDate) : "무기한·미정"}</dd>
                      <dt className="text-muted">남은 횟수</dt>
                      <dd className="num whitespace-nowrap text-right">{d.remainingCount === null ? "—" : `${d.remainingCount}회`}</dd>
                      <dt className="text-muted">월 납입</dt>
                      <dd className="num whitespace-nowrap text-right">{formatKRW(d.monthly)}</dd>
                      <dt className="text-muted">남은 납입 총액(추정)</dt>
                      <dd className="num whitespace-nowrap text-right text-sm font-semibold">{formatKRW(d.remainingTotal)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
              <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "부채 상환 타임라인", className: "hidden md:block" }}>
                <THead>
                  <TR>
                    <TH>항목</TH>
                    <TH>종료일</TH>
                    <TH className="text-right">남은 횟수</TH>
                    <TH className="text-right">월 납입</TH>
                    <TH className="whitespace-normal text-right">남은 납입 총액(추정)</TH>
                  </TR>
                </THead>
                <TBody>
                  {debts.map((d) => (
                    <TR key={`${d.kind}-${d.id}`}>
                      <TD className="min-w-32 whitespace-normal font-medium">{d.name}</TD>
                      <TD className="num">{d.endDate ? formatDate(d.endDate) : "무기한·미정"}</TD>
                      <TD className="num text-right">{d.remainingCount === null ? "—" : `${d.remainingCount}회`}</TD>
                      <TD className="num text-right">{formatKRW(d.monthly)}</TD>
                      <TD className="num text-right font-semibold">{formatKRW(d.remainingTotal)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
