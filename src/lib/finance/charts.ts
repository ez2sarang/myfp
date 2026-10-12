// 차트용 데이터 가공 (순수 모듈, 서버에서 실행). 차트 컴포넌트는 이 결과(직렬화 가능한 숫자·문자열)만 받는다.
// 색은 globals.css 의 --chart-* 토큰을 가리키는 CSS 변수 문자열이다(디자인 단계에서 값만 바꾼다).
// 금액을 숨긴 공유 보기에는 차트를 아예 보내지 않는다(비중만으로도 금액 하나를 알면 나머지를 역산할 수 있어서).
import { monthlyProjection } from "./projection.ts";
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type BalanceItem,
  type ExpenseCategory,
  type FixedExpense,
} from "./types.ts";

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  housing: "var(--chart-1)",
  loan: "var(--chart-2)",
  loan_interest: "var(--chart-3)",
  insurance: "var(--chart-4)",
  telecom: "var(--chart-5)",
  subscription: "var(--chart-6)",
  transport: "var(--chart-7)",
  education: "var(--chart-8)",
  tax: "var(--chart-9)",
  utilities: "var(--chart-10)",
  other: "var(--chart-11)",
};

const ASSET_COLORS: Record<(typeof ASSET_CATEGORIES)[number], string> = {
  cash: "var(--chart-1)",
  deposit: "var(--chart-2)",
  investment: "var(--chart-4)",
  real_estate: "var(--chart-3)",
  other: "var(--chart-11)",
};

export interface DonutDatum {
  key: string;
  label: string;
  /** 원 */
  value: number;
  /** 비중(%), 소수 첫째 자리 (금액을 보여 주는 화면에서만 쓴다) */
  percent: number;
  color: string;
}

export interface DonutData {
  /** 가운데 합계 (원) */
  total: number;
  items: DonutDatum[];
}

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackRow {
  month: string;
  label: string;
  /** 계열 key → 금액 (원) */
  values: Record<string, number>;
  total: number;
}

export interface StackData {
  series: StackSeries[];
  rows: StackRow[];
}

export interface CompareDatum {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface CompareData {
  items: CompareDatum[];
}

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function donut(entries: { key: string; label: string; value: number; color: string }[]): DonutData {
  const visible = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const total = visible.reduce((sum, e) => sum + e.value, 0);
  return { total, items: visible.map((e) => ({ ...e, percent: pct(e.value, total) })) };
}

/** 분류별 월 고정지출 도넛. 입력은 summarizeFixed 의 byCategory. */
export function categoryDonut(slices: readonly { category: ExpenseCategory; monthly: number }[]): DonutData {
  return donut(slices.map((s) => ({ key: s.category, label: EXPENSE_CATEGORY_LABELS[s.category], value: s.monthly, color: CATEGORY_COLORS[s.category] })));
}

/** 자산 구성 도넛 (분류별 합계) */
export function assetDonut(items: readonly BalanceItem[]): DonutData {
  return donut(
    ASSET_CATEGORIES.map((c) => ({
      key: c,
      label: ASSET_CATEGORY_LABELS[c],
      value: items.filter((b) => b.kind === "asset" && b.category === c).reduce((sum, b) => sum + b.amount, 0),
      color: ASSET_COLORS[c],
    })),
  );
}

const monthLabel = (month: string, first: boolean): string => {
  const [y, m] = month.split("-");
  return first || m === "01" ? `${(y ?? "").slice(2)}.${Number(m)}월` : `${Number(m)}월`;
};

/** 향후 months 개월 월별 예상 지출 누적 막대 (분류별 계열, 한 번이라도 나오는 분류만) */
export function projectionStack(items: readonly FixedExpense[], today: string, months = 12): StackData {
  const buckets = monthlyProjection(items, today, months);
  const used = EXPENSE_CATEGORIES.filter((c) => buckets.some((b) => (b.byCategory[c] ?? 0) > 0));
  return {
    series: used.map((c) => ({ key: c, label: EXPENSE_CATEGORY_LABELS[c], color: CATEGORY_COLORS[c] })),
    rows: buckets.map((b, i) => ({
      month: b.month,
      label: monthLabel(b.month, i === 0),
      values: Object.fromEntries(used.map((c) => [c, b.byCategory[c] ?? 0])),
      total: b.total,
    })),
  };
}

/** 자산 합계 vs 부채 합계 막대 */
export function assetLiabilityCompare(totals: { assetsTotal: number; liabilitiesTotal: number }): CompareData {
  return {
    items: [
      { key: "asset", label: "자산", value: totals.assetsTotal, color: "var(--chart-asset)" },
      { key: "liability", label: "부채", value: totals.liabilitiesTotal, color: "var(--chart-liability)" },
    ],
  };
}


/** 월별 스냅샷 → 순자산 추이 점 (오래된 달부터) */
export function netWorthTrend(snapshots: readonly { month: string; assetsTotal: number; liabilitiesTotal: number }[]) {
  return [...snapshots]
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    .map((s) => ({ month: s.month, assets: s.assetsTotal, liabilities: s.liabilitiesTotal, netWorth: s.assetsTotal - s.liabilitiesTotal }));
}
