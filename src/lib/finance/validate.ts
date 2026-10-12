// 입력 검증 (순수 모듈). 서버 액션과 개인 데이터 적재 스크립트가 같은 규칙을 쓴다.
// 입력은 문자열 필드 모음(폼 값)이고, 결과는 DB 에 그대로 넣을 수 있는 정규화된 값이다. 사용자 id 같은 소유자 정보는 입력에서 읽지 않는다
// (소유자는 항상 서버 세션이 정한다).
import { isValidDate } from "./dates.ts";
import { endDateFromRemainingCount } from "./schedule.ts";
import {
  ASSET_CATEGORIES,
  BALANCE_KINDS,
  CYCLES,
  EXPENSE_CATEGORIES,
  EXPENSE_SOURCES,
  LIABILITY_CATEGORIES,
  MAX_AMOUNT,
  PAYMENT_METHODS,
  isOneOf,
  type BalanceCategory,
  type BalanceKind,
  type Cycle,
  type ExpenseCategory,
  type ExpenseSource,
  type PaymentMethod,
} from "./types.ts";

export type Fields = Readonly<Record<string, string | undefined>>;
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// 보이지 않는 문자: 서식 문자(\p{Cf} — 폭 없는 공백·방향 표시·BOM·소프트 하이픈·태그 문자 U+E0000–E007F 포함)와
// 한글 채움 문자(U+3164·U+115F·U+1160·U+FFA0). 이름이 비어 보이거나 같은 이름이 달라 보이는 것을 막는다.
const INVISIBLE = /^[\p{Cf}\u{3164}\u{115F}\u{1160}\u{FFA0}]$/u;
const PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u;
/** 이모지 뒤에 붙는 변형 선택자·피부색 */
const EMOJI_TAIL = /^[\u{FE0F}\u{1F3FB}-\u{1F3FF}]$/u;

/** 보이지 않는 문자를 지운다(거부하지 않음). 이모지 사이의 ZWJ(U+200D, 이모지 조합)만 남긴다.
 *  코드포인트를 한 번만 훑고, ZWJ 는 직전(변형 선택자·피부색이면 한 칸 더 앞)과 직후 코드포인트만 본다. */
export function stripInvisible(text: string): string {
  const cps = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < cps.length; i += 1) {
    const ch = cps[i] as string;
    if (!INVISIBLE.test(ch)) {
      out.push(ch);
      continue;
    }
    if (ch !== "\u{200D}") continue;
    let before = i - 1;
    if (before >= 0 && EMOJI_TAIL.test(cps[before] as string)) before -= 1;
    const after = cps[i + 1];
    if (before >= 0 && PICTOGRAPHIC.test(cps[before] as string) && after !== undefined && PICTOGRAPHIC.test(after)) out.push(ch);
  }
  return out.join("");
}

/** 원문 길이 상한 배수: 이보다 길면 정리하지 않고 '너무 김'으로 거부한다(자르면 사용자 값이 조용히 바뀌므로 자르지 않는다) */
export const RAW_LENGTH_FACTOR = 4;

/**
 * 앞뒤 공백 제거, 제어 문자·보이지 않는 문자 제거, NFC 정규화. 비면 null. 최대 길이를 넘으면 오류 표시용으로 undefined.
 * 순서: 원문 길이 상한(max × 4) → 제어·보이지 않는 문자 제거 → NFC(제거로 붙게 된 한글 자모·결합 문자도 합쳐진다) → 공백 정리 → 길이.
 */
export function cleanText(raw: string | undefined, max: number): string | null | undefined {
  if (typeof raw !== "string") return null;
  if (raw.length > max * RAW_LENGTH_FACTOR) return undefined;
  const text = stripInvisible(raw.replace(CONTROL, "")).normalize("NFC").trim();
  if (text.length === 0) return null;
  return text.length > max ? undefined : text;
}

/** "1,234,000" · "1234000원" · " 1 234 " 형태를 원 단위 정수로. 음수·소수·범위 밖은 null. */
export function parseAmount(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\s,원₩]/g, "");
  if (!/^\d{1,13}$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT ? value : null;
}

function parseIntIn(raw: string | undefined, min: number, max: number): number | null {
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}

const isOn = (raw: string | undefined): boolean => raw === "on" || raw === "1" || raw === "true";
const blank = (raw: string | undefined): boolean => typeof raw !== "string" || raw.trim().length === 0;

export interface FixedInput {
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
  /** 나만 보기 (체크박스 private) */
  private?: boolean;
}

/**
 * 고정지출 입력. remaining_count(남은 횟수)를 주면 today 기준으로 종료일로 바꿔 저장한다(남은 횟수 자체는 저장하지 않는다).
 * 체크박스 active 는 폼에 없으면 꺼진 것으로 본다. activeDefault 로 기본값을 줄 수 있다(가져오기용).
 */
export function parseFixedInput(fields: Fields, today: string, opts: { activeDefault?: boolean } = {}): Validation<FixedInput> {
  const errors: Record<string, string> = {};
  const name = cleanText(fields.name, 100);
  if (!name) errors.name = name === undefined ? "이름은 100자 이하로 입력해 주세요." : "이름을 입력해 주세요.";

  const category = fields.category;
  if (!isOneOf(EXPENSE_CATEGORIES, category)) errors.category = "분류를 선택해 주세요.";

  const amount = parseAmount(fields.amount);
  if (amount === null) errors.amount = "금액은 0 이상 1조 이하의 원 단위 정수로 입력해 주세요.";

  const cycle = blank(fields.cycle) ? "monthly" : fields.cycle;
  if (!isOneOf(CYCLES, cycle)) errors.cycle = "주기를 선택해 주세요.";

  let billingDay: number | null = null;
  if (!blank(fields.billing_day)) {
    billingDay = parseIntIn(fields.billing_day, 1, 31);
    if (billingDay === null) errors.billing_day = "납부일은 1~31 사이로 입력해 주세요 (31 은 말일).";
  }
  let billingMonth: number | null = null;
  if (cycle === "yearly") {
    if (!blank(fields.billing_month)) {
      billingMonth = parseIntIn(fields.billing_month, 1, 12);
      if (billingMonth === null) errors.billing_month = "납부 월은 1~12 사이로 입력해 주세요.";
    } else if (billingDay !== null) {
      errors.billing_month = "매년 내는 항목은 납부 월을 입력해 주세요.";
    }
  }

  let paymentMethod: PaymentMethod | null = null;
  if (!blank(fields.payment_method)) {
    if (isOneOf(PAYMENT_METHODS, fields.payment_method)) paymentMethod = fields.payment_method;
    else errors.payment_method = "결제수단을 다시 선택해 주세요.";
  }

  const institution = cleanText(fields.institution, 100);
  if (institution === undefined) errors.institution = "기관·카드명은 100자 이하로 입력해 주세요.";
  const note = cleanText(fields.note, 500);
  if (note === undefined) errors.note = "메모는 500자 이하로 입력해 주세요.";

  const startDate = blank(fields.start_date) ? null : (fields.start_date as string).trim();
  if (startDate !== null && !isValidDate(startDate)) errors.start_date = "시작일 형식이 올바르지 않습니다.";
  let endDate = blank(fields.end_date) ? null : (fields.end_date as string).trim();
  if (endDate !== null && !isValidDate(endDate)) errors.end_date = "종료일 형식이 올바르지 않습니다.";

  if (!blank(fields.remaining_count)) {
    const count = parseIntIn(fields.remaining_count, 1, 600);
    if (count === null) errors.remaining_count = "남은 횟수는 1~600 사이로 입력해 주세요.";
    else if (billingDay === null) errors.remaining_count = "남은 횟수로 종료일을 계산하려면 납부일이 필요합니다.";
    else if (isOneOf(CYCLES, cycle)) {
      endDate = endDateFromRemainingCount({ count, cycle, billingDay, billingMonth, asOf: today });
      if (endDate === null) errors.remaining_count = "남은 횟수로 종료일을 계산하지 못했습니다.";
    }
  }
  if (startDate && endDate && isValidDate(startDate) && isValidDate(endDate) && endDate < startDate) {
    errors.end_date = "종료일은 시작일보다 빠를 수 없습니다.";
  }

  const source = blank(fields.source) ? "manual" : fields.source;
  if (!isOneOf(EXPENSE_SOURCES, source)) errors.source = "출처를 다시 선택해 주세요.";

  const active = fields.active === undefined ? (opts.activeDefault ?? false) : isOn(fields.active);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: name as string,
      category: category as ExpenseCategory,
      amount: amount as number,
      cycle: cycle as Cycle,
      billingDay,
      billingMonth: cycle === "yearly" ? billingMonth : null,
      paymentMethod,
      institution: institution ?? null,
      startDate,
      endDate,
      active,
      note: note ?? null,
      source: source as ExpenseSource,
      private: isOn(fields.private),
    },
  };
}

export interface BalanceInput {
  kind: BalanceKind;
  category: BalanceCategory;
  name: string;
  amount: number;
  asOf: string | null;
  note: string | null;
  monthlyPayment: number | null;
  interestRate: number | null;
  endDate: string | null;
  /** 나만 보기 (체크박스 private) */
  private?: boolean;
}

/** 자산·부채 입력. 월 상환액·금리·종료일은 부채에서만 받고 자산이면 버린다. */
export function parseBalanceInput(fields: Fields): Validation<BalanceInput> {
  const errors: Record<string, string> = {};
  const kind = fields.kind;
  if (!isOneOf(BALANCE_KINDS, kind)) errors.kind = "자산 또는 부채를 선택해 주세요.";
  const categories: readonly string[] = kind === "liability" ? LIABILITY_CATEGORIES : ASSET_CATEGORIES;
  const category = fields.category;
  if (typeof category !== "string" || !categories.includes(category)) errors.category = "분류를 선택해 주세요.";

  const name = cleanText(fields.name, 100);
  if (!name) errors.name = name === undefined ? "이름은 100자 이하로 입력해 주세요." : "이름을 입력해 주세요.";
  const amount = parseAmount(fields.amount);
  if (amount === null) errors.amount = "금액(잔액)은 0 이상 1조 이하의 원 단위 정수로 입력해 주세요.";
  const asOf = blank(fields.as_of) ? null : (fields.as_of as string).trim();
  if (asOf !== null && !isValidDate(asOf)) errors.as_of = "기준일 형식이 올바르지 않습니다.";
  const note = cleanText(fields.note, 500);
  if (note === undefined) errors.note = "메모는 500자 이하로 입력해 주세요.";

  let monthlyPayment: number | null = null;
  let interestRate: number | null = null;
  let endDate: string | null = null;
  if (kind === "liability") {
    if (!blank(fields.monthly_payment)) {
      monthlyPayment = parseAmount(fields.monthly_payment);
      if (monthlyPayment === null) errors.monthly_payment = "월 상환액은 원 단위 정수로 입력해 주세요.";
    }
    if (!blank(fields.interest_rate)) {
      const raw = (fields.interest_rate as string).trim().replace(/%$/, "");
      interestRate = /^\d{1,3}(\.\d{1,3})?$/.test(raw) && Number(raw) <= 100 ? Number(raw) : null;
      if (interestRate === null) errors.interest_rate = "금리는 0~100 사이 숫자(소수점 셋째 자리까지)로 입력해 주세요.";
    }
    if (!blank(fields.end_date)) {
      endDate = (fields.end_date as string).trim();
      if (!isValidDate(endDate)) errors.end_date = "종료일 형식이 올바르지 않습니다.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: kind as BalanceKind,
      category: category as BalanceCategory,
      name: name as string,
      amount: amount as number,
      asOf,
      note: note ?? null,
      monthlyPayment,
      interestRate,
      endDate,
      private: isOn(fields.private),
    },
  };
}
