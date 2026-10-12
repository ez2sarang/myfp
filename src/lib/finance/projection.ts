// 향후 N개월 월별 예상 지출 (순수 모듈, Asia/Seoul 달력 날짜). 대시보드의 누적 막대와 공유 보기가 쓴다.
// 한 달의 금액 = 그 달에 실제로 내는 금액:
//  - 월 주기: 그 달의 납부일(말일 규칙 적용)이 시작일~종료일 안이면 포함. 납부일이 미정이면 그 달이 기간과 겹칠 때 포함.
//  - 연 주기: 납부 월에만 전액. 납부 월이 미정이면 매달 12분의 1(반올림).
//  - 비활성·보관 항목은 빠진다. 종료일이 지난 달부터는 빠지므로 대출이 끝나면 막대가 줄어든다.
import { addMonths, daysInMonth, dueDay, formatYmd, parseYmd } from "./dates.ts";
import type { ExpenseCategory, FixedExpense } from "./types.ts";

export interface MonthBucket {
  /** YYYY-MM */
  month: string;
  total: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}

type ProjectionItem = Pick<FixedExpense, "category" | "amount" | "cycle" | "billingDay" | "billingMonth" | "startDate" | "endDate" | "active" | "archived">;

/** 한 항목이 y년 m월에 내는 금액 (없으면 0) */
export function amountInMonth(item: ProjectionItem, y: number, m: number): number {
  if (!item.active || item.archived) return 0;
  const first = formatYmd(y, m, 1);
  const last = formatYmd(y, m, daysInMonth(y, m));
  if (item.startDate && item.startDate > last) return 0;
  if (item.endDate && item.endDate < first) return 0;
  const within = (date: string) => (!item.startDate || date >= item.startDate) && (!item.endDate || date <= item.endDate);

  if (item.cycle === "yearly") {
    if (item.billingMonth === null) return Math.round(item.amount / 12);
    if (item.billingMonth !== m) return 0;
    if (item.billingDay === null) return item.amount;
    return within(formatYmd(y, m, dueDay(y, m, item.billingDay))) ? item.amount : 0;
  }
  if (item.billingDay === null) return item.amount;
  return within(formatYmd(y, m, dueDay(y, m, item.billingDay))) ? item.amount : 0;
}

/** 오늘이 속한 달부터 months 개월의 월별 예상 지출 */
export function monthlyProjection(items: readonly ProjectionItem[], today: string, months = 12): MonthBucket[] {
  const start = parseYmd(today);
  if (!start) throw new Error("날짜 형식이 올바르지 않습니다.");
  const out: MonthBucket[] = [];
  for (let i = 0; i < months; i += 1) {
    const { y, m } = addMonths(start.y, start.m, i);
    const bucket: MonthBucket = { month: `${y}-${String(m).padStart(2, "0")}`, total: 0, byCategory: {} };
    for (const item of items) {
      const amount = amountInMonth(item, y, m);
      if (amount === 0) continue;
      bucket.total += amount;
      bucket.byCategory[item.category] = (bucket.byCategory[item.category] ?? 0) + amount;
    }
    out.push(bucket);
  }
  return out;
}
