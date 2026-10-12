// 납부 일정 계산 (순수 모듈). 모든 날짜는 Asia/Seoul 달력 날짜(YYYY-MM-DD)이고 "오늘"은 호출하는 쪽이 seoulToday() 로 넘긴다.
//  - 납부일 31(또는 그 달에 없는 날짜)은 그 달의 말일로 처리한다.
//  - 연 주기는 납부 월(billingMonth)의 납부일에 한 번 낸다.
//  - 납부일이 없는 항목(미정)은 일정·남은 횟수를 계산하지 않는다(null).
import { addDays, addMonths, diffDays, dueDay, formatYmd, parseYmd } from "./dates.ts";
import type { Cycle, FixedExpense } from "./types.ts";

export type ScheduleItem = Pick<FixedExpense, "amount" | "cycle" | "billingDay" | "billingMonth" | "startDate" | "endDate">;

const MAX_ITERATIONS = 2400;

/** from 당일을 포함해 그 이후 첫 납부일. 시작일 이전·종료일 이후는 제외. 계산할 수 없으면 null. */
export function nextBillingDate(item: ScheduleItem, from: string): string | null {
  if (item.billingDay === null || item.billingDay < 1 || item.billingDay > 31) return null;
  const start = item.startDate && item.startDate > from ? item.startDate : from;
  const p = parseYmd(start);
  if (!p) return null;
  let candidate: string;
  if (item.cycle === "yearly") {
    if (item.billingMonth === null || item.billingMonth < 1 || item.billingMonth > 12) return null;
    candidate = formatYmd(p.y, item.billingMonth, dueDay(p.y, item.billingMonth, item.billingDay));
    if (candidate < start) candidate = formatYmd(p.y + 1, item.billingMonth, dueDay(p.y + 1, item.billingMonth, item.billingDay));
  } else {
    candidate = formatYmd(p.y, p.m, dueDay(p.y, p.m, item.billingDay));
    if (candidate < start) {
      const n = addMonths(p.y, p.m, 1);
      candidate = formatYmd(n.y, n.m, dueDay(n.y, n.m, item.billingDay));
    }
  }
  if (item.endDate && candidate > item.endDate) return null;
  return candidate;
}

/** [from, toExclusive) 구간의 모든 납부일 */
export function occurrencesBetween(item: ScheduleItem, from: string, toExclusive: string): string[] {
  const out: string[] = [];
  let cursor = from;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const next = nextBillingDate(item, cursor);
    if (next === null || next >= toExclusive) break;
    out.push(next);
    cursor = addDays(next, 1);
  }
  return out;
}

export interface UpcomingPayment<T> {
  item: T;
  date: string;
  daysLeft: number;
}

/** 오늘부터 days 일 동안(오늘 포함, today+days 미포함)의 납부 일정. 활성·보관되지 않은 항목만. 날짜 → 이름 순. */
export function upcomingPayments<T extends ScheduleItem & { active: boolean; archived: boolean; name: string }>(
  items: readonly T[],
  today: string,
  days = 30,
): UpcomingPayment<T>[] {
  const end = addDays(today, days);
  const out: UpcomingPayment<T>[] = [];
  for (const item of items) {
    if (!item.active || item.archived) continue;
    for (const date of occurrencesBetween(item, today, end)) out.push({ item, date, daysLeft: diffDays(date, today) });
  }
  return out.sort((a, b) => (a.date === b.date ? a.item.name.localeCompare(b.item.name, "ko") : a.date < b.date ? -1 : 1));
}

/** 오늘(포함)부터 종료일(포함)까지 남은 납부 횟수. 종료일이 없거나 납부일이 미정이면 null(무기한·계산 불가). */
export function remainingPayments(item: ScheduleItem, today: string): number | null {
  if (!item.endDate || item.billingDay === null) return null;
  if (item.endDate < today) return 0;
  return occurrencesBetween(item, today, addDays(item.endDate, 1)).length;
}

/** 남은 납입 총액 추정 = 남은 횟수 × 금액. 무기한이면 null. */
export function remainingCommittedTotal(item: ScheduleItem, today: string): number | null {
  const n = remainingPayments(item, today);
  return n === null ? null : n * item.amount;
}

/** 월 환산 금액 (연 주기는 12로 나눠 반올림). */
export function monthlyEquivalent(item: Pick<ScheduleItem, "amount" | "cycle">): number {
  return item.cycle === "yearly" ? Math.round(item.amount / 12) : item.amount;
}

/** 오늘 기준으로 효력이 있는 항목인지: 활성, 보관 안 됨, 시작일이 지났고 종료일 전. */
export function isInEffect(item: Pick<FixedExpense, "active" | "archived" | "startDate" | "endDate">, today: string): boolean {
  if (!item.active || item.archived) return false;
  if (item.startDate && item.startDate > today) return false;
  if (item.endDate && item.endDate < today) return false;
  return true;
}

/**
 * "남은 횟수" 입력을 종료일로 정규화한다: 기준일(asOf) 이후 첫 납부일부터 N 회면 종료일 = 첫 납부일 + (N−1) 주기.
 * 말일 처리 규칙을 그대로 적용한다. 납부일이 없거나 N 이 1 미만이면 null.
 */
export function endDateFromRemainingCount(args: {
  count: number;
  cycle: Cycle;
  billingDay: number | null;
  billingMonth: number | null;
  asOf: string;
}): string | null {
  const { count, cycle, billingDay, billingMonth, asOf } = args;
  if (!Number.isInteger(count) || count < 1 || billingDay === null) return null;
  const first = nextBillingDate({ amount: 0, cycle, billingDay, billingMonth, startDate: null, endDate: null }, asOf);
  if (!first) return null;
  const p = parseYmd(first);
  if (!p) return null;
  if (cycle === "yearly") {
    const y = p.y + count - 1;
    return formatYmd(y, p.m, dueDay(y, p.m, billingDay));
  }
  const t = addMonths(p.y, p.m, count - 1);
  return formatYmd(t.y, t.m, dueDay(t.y, t.m, billingDay));
}
