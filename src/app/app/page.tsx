import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { CategoryChart } from "@/components/charts/category-chart";
import { Stat } from "@/components/shared/stat";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db/pool";
import { listBalances } from "@/lib/db/queries/balance";
import { listFixed } from "@/lib/db/queries/fixed";
import { seoulToday } from "@/lib/finance/dates";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { debtTimeline, summarizeBalances, summarizeFixed, windowLastDay } from "@/lib/finance/summary";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "대시보드" };

export default async function DashboardPage() {
  const viewer = await requireActiveUser("/app");
  const [fixed, balances] = await Promise.all([listFixed(db, viewer.id), listBalances(db, viewer.id)]);
  const today = seoulToday();
  const summary = summarizeFixed(fixed, today);
  const totals = summarizeBalances(balances);
  const debts = debtTimeline(fixed, balances, today);

  if (fixed.length === 0 && balances.length === 0) {
    return (
      <>
        <PageHeader title="대시보드" />
        <EmptyState
          title="아직 등록한 항목이 없습니다"
          description="매달 나가는 고정지출부터 추가해 보세요. 합계·일정·상환 타임라인이 자동으로 계산됩니다."
          action={
            <Link href="/app/fixed" className={buttonClass("primary")}>
              고정지출 추가하기
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="대시보드" description={`${formatDate(today)} 기준 (서울 시간)`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="월 고정지출" value={formatKRW(summary.monthlyTotal)} hint={`활성 ${summary.activeCount}건 · 연 주기는 12로 나눔`} />
        <Stat label="연 환산" value={formatKRW(summary.annualTotal)} />
        <Stat label="다음 30일 납부" value={formatKRW(summary.upcomingTotal)} hint={`${summary.upcoming.length}건 · ${formatDate(windowLastDay(today))}까지`} />
        <Stat
          label="순자산"
          value={formatKRW(totals.netWorth)}
          hint={`자산 ${formatKRW(totals.assetsTotal)} − 부채 ${formatKRW(totals.liabilitiesTotal)}`}
          tone={totals.netWorth < 0 ? "negative" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>분류별 월 고정지출</CardTitle>
          </CardHeader>
          <CardBody>
            {summary.byCategory.length === 0 ? (
              <p className="text-sm text-muted">활성 항목이 없습니다.</p>
            ) : (
              <CategoryChart data={summary.byCategory.map((c) => ({ label: c.label, monthly: c.monthly }))} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>다음 30일 납부 일정</CardTitle>
          </CardHeader>
          <CardBody>
            {summary.upcoming.length === 0 ? (
              <p className="text-sm text-muted">30일 안에 예정된 납부가 없습니다. 납부일이 비어 있는 항목은 일정에 나오지 않습니다.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line text-sm">
                {summary.upcoming.map((u, i) => (
                  <li key={`${u.id}-${u.date}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex flex-col">
                      <span className="font-medium">{u.name}</span>
                      <span className="num text-xs text-muted">
                        {formatDate(u.date)} · {u.daysLeft === 0 ? "오늘" : `${u.daysLeft}일 뒤`}
                      </span>
                    </span>
                    <span className="num font-semibold">{formatKRW(u.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
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
    </>
  );
}
