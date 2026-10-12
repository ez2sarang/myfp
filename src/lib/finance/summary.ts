// 대시보드 요약 계산 (순수 모듈). 대시보드와 공유 보기가 같은 계산을 쓴다.
import { addDays, addMonths, diffDays, formatYmd, parseYmd } from "./dates.ts";
import { isInEffect, monthlyEquivalent, remainingCommittedTotal, remainingPayments, upcomingPayments } from "./schedule.ts";
import { DEBT_CATEGORIES, EXPENSE_CATEGORY_LABELS, type BalanceItem, type ExpenseCategory, type FixedExpense } from "./types.ts";

export interface CategorySlice {
  category: ExpenseCategory;
  label: string;
  monthly: number;
  count: number;
}

export interface UpcomingRow {
  id: string;
  name: string;
  category: ExpenseCategory;
  date: string;
  daysLeft: number;
  amount: number;
}

export interface DebtRow {
  kind: "fixed" | "liability";
  id: string;
  name: string;
  endDate: string | null;
  remainingCount: number | null;
  remainingTotal: number | null;
  monthly: number | null;
}

export interface FixedSummary {
  today: string;
  activeCount: number;
  monthlyTotal: number;
  /** 오늘(포함)부터 이번 달 말일까지 납부 예정 합계·건수 (서울 기준) */
  remainingThisMonth: number;
  remainingThisMonthCount: number;
  byCategory: CategorySlice[];
  upcoming: UpcomingRow[];
  upcomingTotal: number;
}

export interface BalanceSummary {
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorth: number;
}

export function summarizeFixed(items: readonly FixedExpense[], today: string, days = 30): FixedSummary {
  const current = items.filter((i) => isInEffect(i, today));
  const slices = new Map<ExpenseCategory, CategorySlice>();
  let monthlyTotal = 0;
  for (const item of current) {
    const monthly = monthlyEquivalent(item);
    monthlyTotal += monthly;
    const slice = slices.get(item.category) ?? { category: item.category, label: EXPENSE_CATEGORY_LABELS[item.category], monthly: 0, count: 0 };
    slice.monthly += monthly;
    slice.count += 1;
    slices.set(item.category, slice);
  }
  const upcoming = upcomingPayments(items, today, days).map((u) => ({
    id: u.item.id,
    name: u.item.name,
    category: u.item.category,
    date: u.date,
    daysLeft: u.daysLeft,
    amount: u.item.amount,
  }));
  return {
    today,
    activeCount: current.length,
    monthlyTotal,
    ...remainingThisMonth(items, today),
    byCategory: [...slices.values()].sort((a, b) => b.monthly - a.monthly || a.label.localeCompare(b.label, "ko")),
    upcoming,
    upcomingTotal: upcoming.reduce((sum, u) => sum + u.amount, 0),
  };
}

/** 이번 달 남은 납부액: 오늘(포함)부터 이번 달 말일까지의 납부 일정 합계 (upcomingPayments 재사용, 말일 규칙 동일) */
export function remainingThisMonth(items: readonly FixedExpense[], today: string): { remainingThisMonth: number; remainingThisMonthCount: number } {
  const p = parseYmd(today);
  if (!p) throw new Error("날짜 형식이 올바르지 않습니다.");
  const next = addMonths(p.y, p.m, 1);
  const list = upcomingPayments(items, today, diffDays(formatYmd(next.y, next.m, 1), today));
  return { remainingThisMonth: list.reduce((sum, u) => sum + u.item.amount, 0), remainingThisMonthCount: list.length };
}

export function summarizeBalances(items: readonly BalanceItem[]): BalanceSummary {
  let assetsTotal = 0;
  let liabilitiesTotal = 0;
  for (const item of items) {
    if (item.kind === "asset") assetsTotal += item.amount;
    else liabilitiesTotal += item.amount;
  }
  return { assetsTotal, liabilitiesTotal, netWorth: assetsTotal - liabilitiesTotal };
}

/**
 * 부채 상환 타임라인: 대출 상환·대출 이자 분류의 효력 있는 고정지출 + 종료일이 있는 부채 항목. 종료일 빠른 순, 무기한은 뒤.
 * 부채 항목의 남은 횟수는 종료일의 날짜를 매월 상환일로 보고 센다(월 상환액이 없으면 총액은 계산하지 않는다).
 */
export function debtTimeline(fixed: readonly FixedExpense[], balances: readonly BalanceItem[], today: string): DebtRow[] {
  const rows: DebtRow[] = [];
  for (const item of fixed) {
    if (!DEBT_CATEGORIES.includes(item.category) || !isInEffect(item, today)) continue;
    rows.push({
      kind: "fixed",
      id: item.id,
      name: item.name,
      endDate: item.endDate,
      remainingCount: remainingPayments(item, today),
      remainingTotal: remainingCommittedTotal(item, today),
      monthly: monthlyEquivalent(item),
    });
  }
  for (const item of balances) {
    if (item.kind !== "liability" || !item.endDate || item.endDate < today) continue;
    const end = parseYmd(item.endDate);
    const schedule = {
      amount: item.monthlyPayment ?? 0,
      cycle: "monthly" as const,
      billingDay: end ? end.d : null,
      billingMonth: null,
      startDate: null,
      endDate: item.endDate,
    };
    const count = remainingPayments(schedule, today);
    rows.push({
      kind: "liability",
      id: item.id,
      name: item.name,
      endDate: item.endDate,
      remainingCount: count,
      remainingTotal: item.monthlyPayment !== null && count !== null ? count * item.monthlyPayment : null,
      monthly: item.monthlyPayment,
    });
  }
  return rows.sort((a, b) => {
    if (a.endDate === b.endDate) return a.name.localeCompare(b.name, "ko");
    if (a.endDate === null) return 1;
    if (b.endDate === null) return -1;
    return a.endDate < b.endDate ? -1 : 1;
  });
}

/** 30일 창의 마지막 날 (표시용) */
export function windowLastDay(today: string, days = 30): string {
  return addDays(today, days - 1);
}
