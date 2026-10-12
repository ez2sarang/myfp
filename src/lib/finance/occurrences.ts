// 월별 발생 계산 (순수 모듈). 달 M 의 발생 = ① 고정지출 정의에서 계산 ② 달별 덮어쓰기 반영 ③ 예정·일회성 지출.
// 모든 날짜는 Asia/Seoul 달력 날짜(YYYY-MM-DD), 달은 'YYYY-MM'. "오늘"은 호출하는 쪽이 seoulToday() 로 넘긴다.
//  - 고정지출: 시작일 ≤ 그 달 말일, 종료일 없음 또는 ≥ 그 달 1일. 월 주기는 매달, 연 주기는 납부 월에만. 납부일 31(그 달에 없는 날)은 말일.
//    납부일이 정해진 항목은 그 날짜가 시작~종료 안에 있어야 한다. 납부일 미정이면 날짜 없이 그 달에 넣는다(연 주기·납부 월 미정은 12분의 1).
//  - 활성·보관 여부는 이번 달과 미래 달에만 적용한다. 과거 달은 시작·종료일로만 판정한다(비활성 처리로 지난 지출이 사라지지 않게).
//  - 덮어쓰기: 건너뜀이면 합계에서 빠지고(목록에는 남는다), 금액이 있으면 그 달 금액을 바꾼다.
//  - 예정지출: 납부 예정일이 그 달인 것. 건너뜀은 합계에서 빠진다.
import { addMonths, daysInMonth, diffDays, dueDay, formatYmd } from "./dates.ts";
import type { FixedSort, ListQuery } from "./detail-list.ts";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type FixedExpense } from "./types.ts";

export const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type MonthTiming = "past" | "current" | "future";

export interface FixedOverride {
  fixedExpenseId: string;
  month: string;
  amount: number | null;
  skipped: boolean;
}

export const PLANNED_STATUSES = ["planned", "paid", "skipped"] as const;
export type PlannedStatus = (typeof PLANNED_STATUSES)[number];
export const PLANNED_STATUS_LABELS: Record<PlannedStatus, string> = { planned: "예정", paid: "납부 완료", skipped: "건너뜀" };

export interface PlannedExpense {
  id: string;
  dueDate: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  status: PlannedStatus;
  note: string | null;
  groupId: string | null;
  seq: number | null;
  total: number | null;
}

/** 화면 상태: 납부 완료(지난 날짜·과거 달·납부 처리) / 남음(이번 달 오늘 이후) / 예정(미래 달) / 건너뜀 */
export type OccurrenceState = "paid" | "due" | "planned" | "skipped";

export interface Occurrence {
  kind: "fixed" | "planned";
  /** 고정지출 id 또는 예정지출 id */
  id: string;
  name: string;
  category: ExpenseCategory;
  /** 납부일 (고정지출 납부일 미정이면 null) */
  date: string | null;
  /** 이 달에 실제로 내는 금액 (덮어쓰기 반영) */
  amount: number;
  /** 고정지출 정의의 금액 (덮어쓰기와 비교용). 예정지출은 amount 와 같다 */
  baseAmount: number;
  overridden: boolean;
  skipped: boolean;
  state: OccurrenceState;
  /** 예정지출 분할 묶음 (회차/전체) */
  groupId: string | null;
  seq: number | null;
  total: number | null;
}

export const monthOf = (date: string): string => date.slice(0, 7);

export function parseMonth(month: string): { y: number; m: number } | null {
  const match = MONTH_RE.exec(month);
  return match ? { y: Number(match[1]), m: Number(match[2]) } : null;
}

export function formatMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** 달에 n 개월을 더한다 */
export function shiftMonth(month: string, n: number): string {
  const p = parseMonth(month);
  if (!p) throw new Error("달 형식이 올바르지 않습니다.");
  const t = addMonths(p.y, p.m, n);
  return formatMonth(t.y, t.m);
}

/** a − b (개월) */
export function monthDiff(a: string, b: string): number {
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  if (!pa || !pb) throw new Error("달 형식이 올바르지 않습니다.");
  return (pa.y - pb.y) * 12 + (pa.m - pb.m);
}

export function monthBounds(month: string): { first: string; last: string } {
  const p = parseMonth(month);
  if (!p) throw new Error("달 형식이 올바르지 않습니다.");
  return { first: formatYmd(p.y, p.m, 1), last: formatYmd(p.y, p.m, daysInMonth(p.y, p.m)) };
}

export function monthTiming(month: string, today: string): MonthTiming {
  const current = monthOf(today);
  return month < current ? "past" : month > current ? "future" : "current";
}

/** [from, to] 의 달 목록 (오름차순). from > to 면 빈 목록 */
export function monthsBetween(from: string, to: string): string[] {
  const n = monthDiff(to, from);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => shiftMonth(from, i));
}

export function monthLabel(month: string): string {
  const p = parseMonth(month);
  return p ? `${p.y}년 ${p.m}월` : month;
}

type FixedForMonth = Pick<FixedExpense, "id" | "name" | "category" | "amount" | "cycle" | "billingDay" | "billingMonth" | "startDate" | "endDate" | "active" | "archived">;

/** 고정지출 한 건의 그 달 발생 (날짜·정의 금액). 없으면 null. 덮어쓰기는 반영하지 않는다. */
export function fixedOccurrenceIn(item: FixedForMonth, month: string, today: string): { date: string | null; amount: number } | null {
  const p = parseMonth(month);
  if (!p) return null;
  if (monthTiming(month, today) !== "past" && (!item.active || item.archived)) return null;
  const { first, last } = monthBounds(month);
  if (item.startDate && item.startDate > last) return null;
  if (item.endDate && item.endDate < first) return null;
  const within = (date: string) => (!item.startDate || date >= item.startDate) && (!item.endDate || date <= item.endDate);
  if (item.cycle === "yearly") {
    if (item.billingMonth === null) return { date: null, amount: Math.round(item.amount / 12) };
    if (item.billingMonth !== p.m) return null;
    if (item.billingDay === null) return { date: null, amount: item.amount };
    const date = formatYmd(p.y, p.m, dueDay(p.y, p.m, item.billingDay));
    return within(date) ? { date, amount: item.amount } : null;
  }
  if (item.billingDay === null) return { date: null, amount: item.amount };
  const date = formatYmd(p.y, p.m, dueDay(p.y, p.m, item.billingDay));
  return within(date) ? { date, amount: item.amount } : null;
}

function stateFor(timing: MonthTiming, date: string | null, today: string, skipped: boolean, status?: PlannedStatus): OccurrenceState {
  if (skipped) return "skipped";
  if (status === "paid") return "paid";
  if (timing === "past") return "paid";
  if (timing === "future") return "planned";
  return date !== null && date < today ? "paid" : "due";
}

/** 달 M 의 모든 발생 (고정 → 예정, 각각 날짜·이름 순) */
export function monthOccurrences(
  fixed: readonly FixedForMonth[],
  overrides: readonly FixedOverride[],
  planned: readonly PlannedExpense[],
  month: string,
  today: string,
): Occurrence[] {
  const timing = monthTiming(month, today);
  const byFixed = new Map(overrides.filter((o) => o.month === month).map((o) => [o.fixedExpenseId, o]));
  const out: Occurrence[] = [];
  for (const item of fixed) {
    const occ = fixedOccurrenceIn(item, month, today);
    if (!occ) continue;
    const ov = byFixed.get(item.id);
    const skipped = ov?.skipped === true;
    const amount = ov && ov.amount !== null ? ov.amount : occ.amount;
    out.push({
      kind: "fixed",
      id: item.id,
      name: item.name,
      category: item.category,
      date: occ.date,
      amount,
      baseAmount: occ.amount,
      overridden: ov !== undefined,
      skipped,
      state: stateFor(timing, occ.date, today, skipped),
      groupId: null,
      seq: null,
      total: null,
    });
  }
  for (const p of planned) {
    if (monthOf(p.dueDate) !== month) continue;
    const skipped = p.status === "skipped";
    out.push({
      kind: "planned",
      id: p.id,
      name: p.name,
      category: p.category,
      date: p.dueDate,
      amount: p.amount,
      baseAmount: p.amount,
      overridden: false,
      skipped,
      state: stateFor(timing, p.dueDate, today, skipped, p.status),
      groupId: p.groupId,
      seq: p.seq,
      total: p.total,
    });
  }
  const byDate = (a: Occurrence, b: Occurrence) =>
    (a.date ?? "9999") < (b.date ?? "9999") ? -1 : (a.date ?? "9999") > (b.date ?? "9999") ? 1 : a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id);
  return out.sort((a, b) => (a.kind === b.kind ? byDate(a, b) : a.kind === "fixed" ? -1 : 1));
}

export interface MonthSummary {
  month: string;
  timing: MonthTiming;
  fixedTotal: number;
  plannedTotal: number;
  total: number;
  paidTotal: number;
  paidCount: number;
  remainingTotal: number;
  remainingCount: number;
  skippedCount: number;
  byCategory: { category: ExpenseCategory; label: string; amount: number; count: number }[];
}

/** 달 합계: 건너뛴 발생은 빼고, 납부 완료/남음(이번 달)·예정(미래)을 나눈다 */
export function summarizeMonth(occurrences: readonly Occurrence[], month: string, today: string): MonthSummary {
  const counted = occurrences.filter((o) => !o.skipped);
  const sum = (list: readonly Occurrence[]) => list.reduce((s, o) => s + o.amount, 0);
  const paid = counted.filter((o) => o.state === "paid");
  const remaining = counted.filter((o) => o.state !== "paid");
  const cats = new Map<ExpenseCategory, { category: ExpenseCategory; label: string; amount: number; count: number }>();
  for (const o of counted) {
    const c = cats.get(o.category) ?? { category: o.category, label: EXPENSE_CATEGORY_LABELS[o.category], amount: 0, count: 0 };
    c.amount += o.amount;
    c.count += 1;
    cats.set(o.category, c);
  }
  return {
    month,
    timing: monthTiming(month, today),
    fixedTotal: sum(counted.filter((o) => o.kind === "fixed")),
    plannedTotal: sum(counted.filter((o) => o.kind === "planned")),
    total: sum(counted),
    paidTotal: sum(paid),
    paidCount: paid.length,
    remainingTotal: sum(remaining),
    remainingCount: remaining.length,
    skippedCount: occurrences.length - counted.length,
    byCategory: [...cats.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "ko")),
  };
}

/** 그 달의 다음 납부(이번 달은 오늘 이후 첫 발생, 미래 달은 첫 발생). 과거 달은 null */
export function nextInMonth(occurrences: readonly Occurrence[], month: string, today: string): (Occurrence & { daysLeft: number }) | null {
  const timing = monthTiming(month, today);
  if (timing === "past") return null;
  const next = occurrences
    .filter((o) => !o.skipped && o.date !== null && o.state !== "paid" && (timing === "future" || (o.date as string) >= today))
    .sort((a, b) => ((a.date as string) < (b.date as string) ? -1 : (a.date as string) > (b.date as string) ? 1 : a.name.localeCompare(b.name, "ko")))[0];
  return next ? { ...next, daysLeft: diffDays(next.date as string, today) } : null;
}

/** 여러 달의 고정/예정 합계 (월별 추이 막대용) */
export function monthTotals(
  fixed: readonly FixedForMonth[],
  overrides: readonly FixedOverride[],
  planned: readonly PlannedExpense[],
  months: readonly string[],
  today: string,
): { month: string; fixed: number; planned: number; total: number }[] {
  return months.map((month) => {
    const s = summarizeMonth(monthOccurrences(fixed, overrides, planned, month, today), month, today);
    return { month, fixed: s.fixedTotal, planned: s.plannedTotal, total: s.total };
  });
}

/** 분할 추가: 같은 금액·같은 날짜(말일 규칙)로 count 개월. 첫 회는 dueDate */
export function installmentDates(dueDate: string, count: number): string[] {
  const y = Number(dueDate.slice(0, 4));
  const m = Number(dueDate.slice(5, 7));
  const d = Number(dueDate.slice(8, 10));
  return Array.from({ length: count }, (_, i) => {
    const t = addMonths(y, m, i);
    return formatYmd(t.y, t.m, dueDay(t.y, t.m, d));
  });
}

/** ?month= 값 검증: 형식이 맞고 [min, max] 안이면 그대로, 아니면 fallback */
export function parseMonthParam(raw: string | string[] | undefined, range: { min: string; max: string; fallback: string }): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !MONTH_RE.test(value)) return range.fallback;
  return value < range.min || value > range.max ? range.fallback : value;
}

export interface OccurrenceDetails {
  query: ListQuery<FixedSort>;
  categories: { key: ExpenseCategory; label: string }[];
  rows: Occurrence[];
  count: number;
  /** 보이는 행 중 건너뛰지 않은 것의 합계 */
  total: number;
}

/** 달 발생 목록의 정렬·분류 필터 (대시보드 세부 항목). 날짜 미정은 날짜순에서 맨 뒤, 동률은 이름 → 종류 → id */
export function occurrenceDetails(occurrences: readonly Occurrence[], query: ListQuery<FixedSort>): OccurrenceDetails {
  const categories = EXPENSE_CATEGORIES.filter((c) => occurrences.some((o) => o.category === c)).map((key) => ({ key, label: EXPENSE_CATEGORY_LABELS[key] }));
  const cat = query.cat && categories.some((c) => c.key === query.cat) ? (query.cat as ExpenseCategory) : null;
  const visible = (cat ? occurrences.filter((o) => o.category === cat) : occurrences).slice();
  const sign = query.dir === "desc" ? -1 : 1;
  const tie = (a: Occurrence, b: Occurrence) => a.name.localeCompare(b.name, "ko") || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
  visible.sort((a, b) => {
    let primary = 0;
    if (query.sort === "date") {
      if (a.date !== b.date) {
        if (a.date === null) return 1;
        if (b.date === null) return -1;
        primary = a.date < b.date ? -1 : 1;
      }
    } else if (query.sort === "amount") primary = a.amount - b.amount;
    else if (query.sort === "category") primary = EXPENSE_CATEGORY_LABELS[a.category].localeCompare(EXPENSE_CATEGORY_LABELS[b.category], "ko");
    else primary = a.name.localeCompare(b.name, "ko");
    return primary !== 0 ? primary * sign : tie(a, b);
  });
  return {
    query: { sort: query.sort, dir: query.dir, cat },
    categories,
    rows: visible,
    count: visible.length,
    total: visible.filter((o) => !o.skipped).reduce((s, o) => s + o.amount, 0),
  };
}
