import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { FixedDetailCard } from "@/components/detail/fixed-detail-card";
import { Stat } from "@/components/shared/stat";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db/pool";
import { listBalances } from "@/lib/db/queries/balance";
import { listFixed } from "@/lib/db/queries/fixed";
import { categoryDonut, projectionStack } from "@/lib/finance/charts";
import { seoulToday } from "@/lib/finance/dates";
import { FIXED_SORTS, fixedDetails, listHref, parseListQuery, type FixedSort } from "@/lib/finance/detail-list";
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
  const query = parseListQuery<FixedSort>(await searchParams, { sorts: FIXED_SORTS, defaultSort: "date", categories: EXPENSE_CATEGORIES });
  const [fixed, balances] = await Promise.all([listFixed(db, viewer.id), listBalances(db, viewer.id)]);
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

  return (
    <>
      <PageHeader title="대시보드" description={`${formatDate(today)} 기준 (서울 시간)`} />
      {empty ? (
        <div role="note" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-info-bg px-4 py-3 text-sm text-info-ink">
          <span>아직 등록한 항목이 없습니다. 고정지출을 추가하면 합계·차트·일정이 자동으로 계산됩니다.</span>
          <Link href="/app/fixed#add-fixed" className={buttonClass("primary", "sm")}>
            고정지출 추가하기
          </Link>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="월 고정지출" value={formatKRW(summary.monthlyTotal)} hint={`활성 ${summary.activeCount}건 · 연 주기는 12로 나눔`} />
        <Stat label="연 환산" value={formatKRW(summary.annualTotal)} />
        <Stat
          label="다음 납부"
          value={next ? (next.daysLeft === 0 ? "오늘" : `D-${next.daysLeft}`) : "—"}
          hint={next ? `${formatDate(next.date)} · ${next.item.name} · ${formatKRW(next.item.amount)}` : "납부일이 있는 활성 항목이 없습니다"}
        />
        <Stat
          label="순자산"
          value={formatKRW(totals.netWorth)}
          hint={`자산 ${formatKRW(totals.assetsTotal)} − 부채 ${formatKRW(totals.liabilitiesTotal)}`}
          tone={totals.netWorth < 0 ? "negative" : "default"}
        />
      </div>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>분류별 월 고정지출</CardTitle>
            <p className="text-sm text-muted">분류를 누르면 오른쪽 목록이 그 분류만 보여 줍니다.</p>
          </CardHeader>
          <CardBody>
            <DonutChart data={donut} centerLabel="월 합계" emptyText="활성 고정지출이 없습니다." filterHrefs={filterHrefs} activeKey={details.query.cat} />
          </CardBody>
        </Card>
        <FixedDetailCard details={details} action="/app#detail-list" sorts={FIXED_SORTS} />
      </div>
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>향후 12개월 예상 지출</CardTitle>
            <p className="text-sm text-muted">이번 달부터. 종료일이 지난 항목은 그 달부터 빠집니다.</p>
          </CardHeader>
          <CardBody>
            <StackedBarChart data={projection} title="향후 12개월 월별 예상 지출" emptyText="예상 지출이 없습니다." />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>다음 30일 납부 일정</CardTitle>
            <p className="text-sm text-muted">
              {summary.upcoming.length}건 · {formatKRW(summary.upcomingTotal)} · {formatDate(windowLastDay(today))}까지
            </p>
          </CardHeader>
          <CardBody>
            {summary.upcoming.length === 0 ? (
              <p className="text-sm text-muted">30일 안에 예정된 납부가 없습니다. 납부일이 비어 있는 항목은 일정에 나오지 않습니다.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line text-sm">
                {summary.upcoming.map((u, i) => (
                  <li key={`${u.id}-${u.date}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-3">
                      <span className="num w-12 shrink-0 rounded-md bg-bg-alt py-1 text-center text-xs font-bold">{u.daysLeft === 0 ? "오늘" : `D-${u.daysLeft}`}</span>
                      <span className="flex flex-col">
                        <span className="font-medium">{u.name}</span>
                        <span className="num text-xs text-muted">{formatDate(u.date)}</span>
                      </span>
                    </span>
                    <span className="num font-semibold">{formatKRW(u.amount)}</span>
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
            <p className="text-sm text-muted">상환 중인 항목이 없습니다.</p>
          ) : (
            <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "부채 상환 타임라인" }}>
              <THead>
                <TR>
                  <TH>항목</TH>
                  <TH>종료일</TH>
                  <TH className="text-right">남은 횟수</TH>
                  <TH className="text-right">월 납입</TH>
                  <TH className="text-right">남은 납입 총액(추정)</TH>
                </TR>
              </THead>
              <TBody>
                {debts.map((d) => (
                  <TR key={`${d.kind}-${d.id}`}>
                    <TD className="font-medium">{d.name}</TD>
                    <TD>{d.endDate ? formatDate(d.endDate) : "무기한·미정"}</TD>
                    <TD className="text-right">{d.remainingCount === null ? "—" : `${d.remainingCount}회`}</TD>
                    <TD className="text-right">{formatKRW(d.monthly)}</TD>
                    <TD className="text-right">{formatKRW(d.remainingTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
      </div>
    </>
  );
}
