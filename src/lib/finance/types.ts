// 재무 항목의 값 목록과 한국어 이름 (순수 모듈). DB 의 CHECK 제약(db/migrations/0001_init.sql)과 같은 값을 쓴다.

export const EXPENSE_CATEGORIES = [
  "housing",
  "loan",
  "loan_interest",
  "insurance",
  "telecom",
  "subscription",
  "transport",
  "education",
  "tax",
  "utilities",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  housing: "주거",
  loan: "대출 상환",
  loan_interest: "대출 이자",
  insurance: "보험",
  telecom: "통신",
  subscription: "구독",
  transport: "교통",
  education: "교육",
  tax: "세금",
  utilities: "공과금",
  other: "기타",
};

/** 부채 상환 일정에 나오는 고정지출 분류 */
export const DEBT_CATEGORIES: readonly ExpenseCategory[] = ["loan", "loan_interest"];

export const CYCLES = ["monthly", "yearly"] as const;
export type Cycle = (typeof CYCLES)[number];
export const CYCLE_LABELS: Record<Cycle, string> = { monthly: "매월", yearly: "매년" };

export const PAYMENT_METHODS = ["bank_autopay", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { bank_autopay: "은행 자동이체", card: "카드", other: "기타" };

export const EXPENSE_SOURCES = ["manual", "card_analysis", "user"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];
export const EXPENSE_SOURCE_LABELS: Record<ExpenseSource, string> = { manual: "직접 입력", card_analysis: "카드 분석", user: "사용자 제공" };

export const BALANCE_KINDS = ["asset", "liability"] as const;
export type BalanceKind = (typeof BALANCE_KINDS)[number];
export const BALANCE_KIND_LABELS: Record<BalanceKind, string> = { asset: "자산", liability: "부채" };

export const ASSET_CATEGORIES = ["cash", "deposit", "investment", "real_estate", "other"] as const;
export const LIABILITY_CATEGORIES = ["loan", "card", "other"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type LiabilityCategory = (typeof LIABILITY_CATEGORIES)[number];
export type BalanceCategory = AssetCategory | LiabilityCategory;

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: "현금",
  deposit: "예금·적금",
  investment: "투자",
  real_estate: "부동산",
  other: "기타 자산",
};
export const LIABILITY_CATEGORY_LABELS: Record<LiabilityCategory, string> = { loan: "대출", card: "카드", other: "기타 부채" };

export function balanceCategoryLabel(kind: BalanceKind, category: string): string {
  const labels: Record<string, string> = kind === "asset" ? ASSET_CATEGORY_LABELS : LIABILITY_CATEGORY_LABELS;
  return labels[category] ?? category;
}

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** 고정지출 한 건 (DB 행을 앱 형식으로 바꾼 것). 날짜는 YYYY-MM-DD, 금액은 원 단위 정수. */
export interface FixedExpense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  cycle: Cycle;
  billingDay: number | null;
  billingMonth: number | null;
  paymentMethod: PaymentMethod | null;
  institution: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  note: string | null;
  source: ExpenseSource;
  archived: boolean;
}

export interface BalanceItem {
  id: string;
  kind: BalanceKind;
  category: BalanceCategory;
  name: string;
  amount: number;
  asOf: string | null;
  note: string | null;
  monthlyPayment: number | null;
  interestRate: number | null;
  endDate: string | null;
}

/** 사용자당 상한 */
export const LIMITS = { fixedExpenses: 300, balanceItems: 100, activeShareLinks: 10, plannedExpenses: 600, fixedOverrides: 600 } as const;
export const MAX_AMOUNT = 1_000_000_000_000;
