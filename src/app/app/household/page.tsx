import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarDays, Receipt, Settings, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { HouseholdDetailCard, MemberChips } from "@/components/household/household-parts";
import { MonthNav } from "@/components/monthly/month-nav";
import { Stat } from "@/components/shared/stat";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db/pool";
import { visibleToViewer } from "@/lib/db/queries/household";
import { categoryDonut } from "@/lib/finance/charts";
import { seoulToday } from "@/lib/finance/dates";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { MONTH_PAST_LIMIT } from "@/lib/finance/monthly-validate";
import { monthLabel, monthOf, monthsBetween, nextInMonth, parseMonthParam, shiftMonth, summarizeMonth } from "@/lib/finance/occurrences";
import {
  householdDetails,
  householdOccurrences,
  householdTrend,
  ownerSubtotals,
  parseHouseholdQuery,
  parseMemberSelection,
} from "@/lib/household/rules";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "함께 보기" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// 함께 보기: 그룹 구성원이 내놓은 고정지출·자산/부채를 기준 달(?month=)로 합산한다. 데이터는 visibleToViewer 한 곳에서만 읽는다.
// 구성원 선택(?m=)·정렬·필터·소유자별 나누기(?split=owner)는 모두 쿼리이고, 서버가 허용 목록·내 그룹 구성원 키와 교집합으로 검증한다.
export default async function HouseholdPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireActiveUser("/app/household");
  const params = await searchParams;
  const data = await visibleToViewer(db, viewer.id);
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="함께 보기" title="그룹 합산" description="가족·동거인과 서로 동의한 범위만 모아서 봅니다." />
        <EmptyState
          title="아직 속한 그룹이 없습니다"
          description="그룹을 만들고 초대 링크를 보내거나, 받은 초대 링크를 열어 들어가세요. 상대가 초대를 수락해야만 서로의 항목이 보입니다."
          action={
            <Link href="/app/household/settings" className={buttonClass("primary", "md")}>
              그룹 만들기
            </Link>
          }
        />
      </>
    );
  }
  const today = seoulToday();
  const current = monthOf(today);
  const memberKeys = data.members.map((m) => m.key);
  const selected = parseMemberSelection(params.m, memberKeys);
  const split = first(params.split) === "owner";
  const query = parseHouseholdQuery(params, selected);
  const floor = shiftMonth(current, -MONTH_PAST_LIMIT);
  const earliest = [current, ...data.fixed.map((f) => (f.startDate ? monthOf(f.startDate) : current)), ...data.overrides.map((o) => o.month)].reduce(
    (min, m) => (m < min ? m : min),
    current,
  );
  const minMonth = earliest < floor ? floor : earliest;
  const maxMonth = shiftMonth(current, 12);
  const month = parseMonthParam(params.month, { min: minMonth, max: maxMonth, fallback: current });

  const rows = householdOccurrences(data.fixed, data.overrides, data.members, selected, month, today);
  const ms = summarizeMonth(rows, month, today);
  const next = nextInMonth(rows, month, today);
  const balances = data.balances.filter((b) => selected.includes(b.ownerKey));
  const assets = balances.filter((b) => b.kind === "asset").reduce((s, b) => s + b.amount, 0);
  const liabilities = balances.filter((b) => b.kind === "liability").reduce((s, b) => s + b.amount, 0);
  const shownMembers = data.members.filter((m) => selected.includes(m.key));
  const subtotals = ownerSubtotals(rows, shownMembers);
  const donut = split
    ? (() => {
        const total = subtotals.reduce((s, x) => s + x.total, 0);
        const items = subtotals
          .filter((x) => x.total > 0)
          .map((x) => ({ key: x.key, label: x.tag, value: x.total, percent: total > 0 ? Math.round((x.total / total) * 1000) / 10 : 0, color: data.members.find((m) => m.key === x.key)?.color ?? "var(--chart-7)" }))
          .sort((a, b) => b.value - a.value);
        return { total, items };
      })()
    : categoryDonut(ms.byCategory.map((c) => ({ category: c.category, monthly: c.amount })));
  const details = householdDetails(rows, query);
  const trend = householdTrend(data.fixed, data.overrides, data.members, selected, monthsBetween(month, shiftMonth(month, 11)), today, split);
  const keep: Record<string, string> = {
    ...(month !== current ? { month } : {}),
    ...(selected.length !== memberKeys.length ? { m: selected.join(",") } : {}),
    ...(split ? { split: "owner" } : {}),
  };
  const splitParams: Record<string, string> = { ...keep };
  if (split) delete splitParams.split;
  else splitParams.split = "owner";
  const splitHref = Object.keys(splitParams).length > 0 ? `/app/household?${new URLSearchParams(splitParams).toString()}` : "/app/household";
  const navKeep: Record<string, string> = { ...keep };
  delete navKeep.month;

  return (
    <>
      <PageHeader
        eyebrow={`함께 보기 · ${monthLabel(month)}`}
        title={data.name}
        description="구성원이 각자 내놓은 고정지출·자산/부채만 합산합니다. '나만 보기' 항목과 메모·기관명·결제수단은 보이지 않습니다."
        actions={
          <Link href="/app/household/settings" className={buttonClass("secondary", "sm")}>
            <Settings aria-hidden="true" className="size-4" />
            그룹 설정
          </Link>
        }
      />
      <MonthNav month={month} timing={ms.timing} months={monthsBetween(minMonth, maxMonth)} current={current} basePath="/app/household" keep={navKeep} />
      <MemberChips members={data.members} selected={selected} keep={keep} />

      <section aria-label="합산 요약" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat accent icon={<Receipt />} label="합산 월 고정지출" value={formatKRW(ms.total)} hint={`${shownMembers.length}명 · ${ms.paidCount + ms.remainingCount}건`} />
        <Stat
          icon={<CalendarClock />}
          label={ms.timing === "current" ? "이번 달 남은 납부액" : ms.timing === "past" ? "납부 완료" : "예정 금액"}
          value={formatKRW(ms.timing === "past" ? ms.paidTotal : ms.remainingTotal)}
          hint={ms.timing === "current" ? `납부 완료 ${formatKRW(ms.paidTotal)}` : undefined}
        />
        <Stat
          icon={<CalendarDays />}
          label="다음 납부"
          value={next ? (next.daysLeft === 0 ? "오늘" : ms.timing === "future" ? formatDate(next.date) : `D-${next.daysLeft}`) : "—"}
          hint={next ? `${formatDate(next.date)} · ${next.name} · ${formatKRW(next.amount)}` : undefined}
        />
        <Stat
          icon={<Wallet />}
          label="순자산 합계 (현재 값)"
          value={formatKRW(assets - liabilities)}
          hint={`자산을 내놓은 구성원만 · 자산 ${formatKRW(assets)} − 부채 ${formatKRW(liabilities)}`}
          tone={assets - liabilities < 0 ? "negative" : "default"}
        />
      </section>

      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="shadow-raised lg:min-h-[36rem]">
          <CardHeader className="flex-row flex-wrap items-end justify-between gap-2">
            <CardTitle>{split ? "구성원별" : "분류별"} {monthLabel(month)} 지출</CardTitle>
            <Link href={splitHref} className="text-sm font-medium text-brand underline underline-offset-4">
              {split ? "분류별로 보기" : "구성원별로 나눠 보기"}
            </Link>
          </CardHeader>
          <CardBody className="pt-6">
            <DonutChart data={donut} centerLabel="합산" emptyText="이 달에 합산할 지출이 없습니다." />
          </CardBody>
        </Card>
        <HouseholdDetailCard details={details} members={shownMembers} keep={keep} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>구성원별 소계</CardTitle>
          </CardHeader>
          <CardBody>
            <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "구성원별 소계" }}>
              <THead>
                <TR>
                  <TH>구성원</TH>
                  <TH className="text-right">건수</TH>
                  <TH className="text-right">합계</TH>
                </TR>
              </THead>
              <TBody>
                {subtotals.map((s) => (
                  <TR key={s.key}>
                    <TD className="font-medium">{s.tag}</TD>
                    <TD className="num text-right">{s.count}</TD>
                    <TD className="num text-right font-semibold">{formatKRW(s.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>12개월 예상 지출{split ? " (구성원별)" : ""}</CardTitle>
          </CardHeader>
          <CardBody>
            <StackedBarChart data={trend} title="12개월 합산 예상 지출" emptyText="예상 지출이 없습니다." />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
