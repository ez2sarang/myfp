import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarDays, Plus, Receipt, Wallet } from "lucide-react";
import { DisplayNameHint } from "@/components/app-shell/display-name-hint";
import { PageHeader } from "@/components/app-shell/page-header";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { DayPill } from "@/components/detail/fixed-detail-card";
import { HistoryTab } from "@/components/monthly/history-tab";
import { MonthDetailCard } from "@/components/monthly/month-detail-card";
import { DashboardTabs, MonthNav } from "@/components/monthly/month-nav";
import { PlannedTab } from "@/components/monthly/planned-tab";
import { Stat } from "@/components/shared/stat";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db/pool";
import { listBalances } from "@/lib/db/queries/balance";
import { listFixed } from "@/lib/db/queries/fixed";
import { earliestFixedMonth, listOverrides, listPlanned } from "@/lib/db/queries/monthly";
import { getDisplayName } from "@/lib/db/queries/users";
import { categoryDonut, monthTrendStack } from "@/lib/finance/charts";
import { seoulToday } from "@/lib/finance/dates";
import { FIXED_SORTS, defaultFixedSort, listHref, parseListQuery, type FixedSort } from "@/lib/finance/detail-list";
import { MONTH_PAST_LIMIT } from "@/lib/finance/monthly-validate";
import {
  monthLabel,
  monthOccurrences,
  monthOf,
  monthTotals,
  monthsBetween,
  nextInMonth,
  occurrenceDetails,
  parseMonthParam,
  shiftMonth,
  summarizeMonth,
} from "@/lib/finance/occurrences";
import { EXPENSE_CATEGORIES, isOneOf } from "@/lib/finance/types";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { debtTimeline, summarizeBalances, summarizeFixed, windowLastDay } from "@/lib/finance/summary";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "대시보드" };

const TABS = ["month", "planned", "history"] as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// 대시보드: 기준 달(?month=YYYY-MM, 기본 이번 달·서울) 기준의 요약·도넛·세부 항목·월별 추이. 탭(?tab=)은 이번 달 | 예정지출 | 내역.
// 달 발생은 occurrences.ts(고정지출 정의 + 달별 덮어쓰기 + 예정지출)로 계산한다. 모든 쿼리 값은 허용 형식·범위로 검증한다.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireActiveUser("/app");
  const params = await searchParams;
  const tabRaw = first(params.tab);
  const tab = isOneOf(TABS, tabRaw) ? tabRaw : "month";
  const query = parseListQuery<FixedSort>(params, { sorts: FIXED_SORTS, defaultSort: defaultFixedSort(), categories: EXPENSE_CATEGORIES });
  // 표시 이름 안내는 공급자 이름이 없을 때만 확인한다
  const [fixed, balances, overrides, planned, earliestFixed, displayName] = await Promise.all([
    listFixed(db, viewer.id),
    listBalances(db, viewer.id),
    listOverrides(db, viewer.id),
    listPlanned(db, viewer.id),
    earliestFixedMonth(db, viewer.id),
    viewer.name === null ? getDisplayName(db, viewer.id) : Promise.resolve(viewer.name),
  ]);
  const today = seoulToday();
  const current = monthOf(today);
  // 고를 수 있는 달: 데이터가 있는 가장 이른 달(최대 120개월 전) ~ 이번 달 + 12개월
  const floor = shiftMonth(current, -MONTH_PAST_LIMIT);
  const earliest = [current, earliestFixed, ...planned.map((p) => monthOf(p.dueDate)), ...overrides.map((o) => o.month)]
    .filter((m): m is string => typeof m === "string")
    .reduce((min, m) => (m < min ? m : min), current);
  const minMonth = earliest < floor ? floor : earliest;
  const maxMonth = shiftMonth(current, 12);
  const month = parseMonthParam(params.month, { min: minMonth, max: maxMonth, fallback: current });
  const occurrencesOf = (m: string) => monthOccurrences(fixed, overrides, planned, m, today);
  const empty = fixed.length === 0 && balances.length === 0 && planned.length === 0;

  const header = (
    <>
      {/* 이번 달 탭은 기준 달을 제목으로 한 번만 쓴다(달 고르기 상자는 그 아래). 예정지출·내역 탭은 여러 달을 다루므로 「대시보드」 */}
      <PageHeader
        eyebrow={tab === "month" ? "대시보드" : undefined}
        title={tab === "month" ? monthLabel(month) : "대시보드"}
        description={`${formatDate(today)} 기준 (서울 시간)`}
      />
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
      <DashboardTabs tab={tab} />
    </>
  );

  if (tab === "planned") {
    const months = monthsBetween(current, maxMonth).map((m) => ({ month: m, occurrences: occurrencesOf(m) }));
    return (
      <>
        {header}
        <PlannedTab months={months} today={today} planned={planned} />
      </>
    );
  }

  if (tab === "history") {
    const trend = monthTrendStack(monthTotals(fixed, overrides, planned, monthsBetween(shiftMonth(current, -6), shiftMonth(current, 6)), today));
    // 지난 달 목록은 최근 36개월까지
    const pastFrom = minMonth < shiftMonth(current, -36) ? shiftMonth(current, -36) : minMonth;
    const past = monthsBetween(pastFrom, shiftMonth(current, -1))
      .reverse()
      .map((m) => ({ month: m, occurrences: occurrencesOf(m) }));
    return (
      <>
        {header}
        <HistoryTab trend={trend} past={past} today={today} />
      </>
    );
  }

  const occurrences = occurrencesOf(month);
  const ms = summarizeMonth(occurrences, month, today);
  const next = nextInMonth(occurrences, month, today);
  const totals = summarizeBalances(balances);
  const donut = categoryDonut(ms.byCategory.map((c) => ({ category: c.category, monthly: c.amount })));
  const details = occurrenceDetails(occurrences, query);
  const keep: Record<string, string> = month === current ? {} : { month };
  const filterHrefs = Object.fromEntries(
    donut.items.map((d) => [d.key, listHref("/app", "", { sort: details.query.sort, dir: details.query.dir, cat: d.key }, keep, "#detail-list")]),
  );
  const trend = monthTrendStack(monthTotals(fixed, overrides, planned, monthsBetween(shiftMonth(month, -6), shiftMonth(month, 6)), today));
  const isCurrent = ms.timing === "current";
  // 30일 일정·상환 타임라인은 오늘 기준이라 이번 달 보기에서만 보여 준다
  const summary = isCurrent ? summarizeFixed(fixed, today) : null;
  const debts = isCurrent ? debtTimeline(fixed, balances, today) : [];
  const allMonths = monthsBetween(minMonth, maxMonth);

  return (
    <>
      {header}
      <MonthNav month={month} timing={ms.timing} months={allMonths} current={current} />

      <section aria-label={`${monthLabel(month)} 요약`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          accent
          icon={<Receipt />}
          label="이 달 지출 합계"
          value={formatKRW(ms.total)}
          hint={`고정 ${formatKRW(ms.fixedTotal)} · 예정·일회성 ${formatKRW(ms.plannedTotal)}${ms.skippedCount > 0 ? ` · 건너뜀 ${ms.skippedCount}건` : ""}`}
        />
        {ms.timing === "current" ? (
          <Stat
            icon={<CalendarClock />}
            label="이번 달 남은 납부액"
            value={formatKRW(ms.remainingTotal)}
            hint={`남은 ${ms.remainingCount}건 · 납부 완료 ${formatKRW(ms.paidTotal)} (${ms.paidCount}건)`}
          />
        ) : ms.timing === "past" ? (
          <Stat icon={<CalendarClock />} label="납부 완료" value={formatKRW(ms.paidTotal)} hint={`지난 달 · ${ms.paidCount}건`} />
        ) : (
          <Stat icon={<CalendarClock />} label="예정 금액" value={formatKRW(ms.remainingTotal)} hint={`예정 ${ms.remainingCount}건`} />
        )}
        <Stat
          icon={<CalendarDays />}
          label={ms.timing === "future" ? "이 달 첫 납부" : "다음 납부"}
          value={next ? (ms.timing === "future" ? formatDate(next.date) : next.daysLeft === 0 ? "오늘" : `D-${next.daysLeft}`) : "—"}
          hint={next ? `${formatDate(next.date)} · ${next.name} · ${formatKRW(next.amount)}` : ms.timing === "past" ? "지난 달입니다" : "남은 납부가 없습니다"}
        />
        <Stat
          icon={<Wallet />}
          label="순자산 (현재 값)"
          value={formatKRW(totals.netWorth)}
          hint={`자산 ${formatKRW(totals.assetsTotal)} − 부채 ${formatKRW(totals.liabilitiesTotal)}`}
          tone={totals.netWorth < 0 ? "negative" : "default"}
        />
      </section>

      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="shadow-raised lg:min-h-[36rem]">
          <CardHeader>
            <CardTitle>분류별 {monthLabel(month)} 지출</CardTitle>
            <p className="text-sm text-muted">고정지출과 예정·일회성을 합쳐 이 달에 실제로 내는 금액입니다. 분류를 누르면 오른쪽 목록이 그 분류만 보여 줍니다.</p>
          </CardHeader>
          <CardBody className="pt-6">
            <DonutChart data={donut} centerLabel="이 달 합계" emptyText="이 달에 낼 지출이 없습니다." filterHrefs={filterHrefs} activeKey={details.query.cat} />
          </CardBody>
        </Card>
        <MonthDetailCard details={details} sorts={FIXED_SORTS} keep={keep} fill />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>월별 지출 추이</CardTitle>
            <p className="text-sm text-muted">기준 달 앞뒤 6개월. 고정지출(달별 변경 반영)과 예정·일회성을 나눠 쌓습니다.</p>
          </div>
          <Badge tone="brand">{monthLabel(month)} 중심</Badge>
        </CardHeader>
        <CardBody>
          <StackedBarChart data={trend} title="월별 지출 추이" emptyText="표시할 지출이 없습니다." />
        </CardBody>
      </Card>

      {summary ? (
        <>
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
      ) : null}
    </>
  );
}
