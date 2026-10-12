// 월 단위 입력 검증 (순수 모듈): 예정지출 추가·수정, 달별 덮어쓰기. 서버 액션이 쓰고, 소유자는 입력에서 읽지 않는다.
// 범위: 달·날짜는 이번 달 기준 과거 120개월 ~ 이후 12개월(분할 추가는 첫 회 기준, 마지막 회는 최대 35개월 더 뒤).
import { isValidDate } from "./dates.ts";
import { MONTH_RE, PLANNED_STATUSES, monthDiff, monthOf, type PlannedStatus } from "./occurrences.ts";
import { cleanText, parseAmount, type Fields, type Validation } from "./validate.ts";
import { EXPENSE_CATEGORIES, isOneOf, type ExpenseCategory } from "./types.ts";

export const MONTH_PAST_LIMIT = 120;
export const MONTH_FUTURE_LIMIT = 12;
export const MAX_INSTALLMENTS = 36;

/** 달이 허용 범위(이번 달 −120 ~ +12) 안인지 */
export function monthInEditableRange(month: string, today: string): boolean {
  if (!MONTH_RE.test(month)) return false;
  const d = monthDiff(month, monthOf(today));
  return d >= -MONTH_PAST_LIMIT && d <= MONTH_FUTURE_LIMIT;
}

export interface PlannedInput {
  name: string;
  category: ExpenseCategory;
  amount: number;
  dueDate: string;
  /** 분할 회차 수 (1 = 한 번) */
  count: number;
}

export function parsePlannedInput(fields: Fields, today: string, opts: { allowCount: boolean }): Validation<PlannedInput> {
  const errors: Record<string, string> = {};
  const name = cleanText(fields.name, 60);
  if (!name) errors.name = name === undefined ? "이름은 60자 이하로 입력해 주세요." : "이름을 입력해 주세요.";
  const category = fields.category;
  if (!isOneOf(EXPENSE_CATEGORIES, category)) errors.category = "분류를 선택해 주세요.";
  const amount = parseAmount(fields.amount);
  if (amount === null) errors.amount = "금액은 0 이상 1조 이하의 원 단위 정수로 입력해 주세요.";
  const dueDate = (fields.dueDate ?? "").trim();
  if (!isValidDate(dueDate) || !monthInEditableRange(monthOf(dueDate), today)) errors.dueDate = "날짜는 이번 달 기준 10년 전부터 12개월 뒤까지 고를 수 있습니다.";
  let count = 1;
  if (opts.allowCount && (fields.count ?? "").trim() !== "") {
    const raw = (fields.count ?? "").trim();
    count = /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
    if (count < 1 || count > MAX_INSTALLMENTS) errors.count = `분할 횟수는 1~${MAX_INSTALLMENTS} 사이로 입력해 주세요.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name: name as string, category: category as ExpenseCategory, amount: amount as number, dueDate, count } };
}

export function parsePlannedStatus(raw: unknown): PlannedStatus | null {
  return isOneOf(PLANNED_STATUSES, raw) ? raw : null;
}

export interface OverrideInput {
  month: string;
  /** null 이면 금액은 정의 그대로 */
  amount: number | null;
  skipped: boolean;
}

/** 덮어쓰기: mode=amount 면 금액 필수, mode=skip 이면 건너뜀. 달은 허용 범위 안. */
export function parseOverrideInput(fields: Fields, today: string): Validation<OverrideInput> {
  const errors: Record<string, string> = {};
  const month = (fields.month ?? "").trim();
  if (!monthInEditableRange(month, today)) errors.month = "바꿀 수 없는 달입니다.";
  const mode = fields.mode;
  let amount: number | null = null;
  if (mode === "amount") {
    amount = parseAmount(fields.amount);
    if (amount === null) errors.amount = "금액은 0 이상 1조 이하의 원 단위 정수로 입력해 주세요.";
  } else if (mode !== "skip") errors.mode = "알 수 없는 요청입니다.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { month, amount, skipped: mode === "skip" } };
}
