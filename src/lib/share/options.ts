// 공유 링크 설정: 포함 섹션(scopes)과 가림(masks) (순수 모듈). DB 의 jsonb 값은 신뢰하지 않고 읽을 때마다 이 함수로 다시 정규화한다.
import { seoulToday } from "../finance/dates.ts";
import { monthInEditableRange } from "../finance/monthly-validate.ts";
import { MONTH_RE, monthDiff, monthLabel, monthOf, monthsBetween } from "../finance/occurrences.ts";
import { cleanText, type Fields, type Validation } from "../finance/validate.ts";
import { expiryFrom } from "./token.ts";

export const SHARE_SCOPES = ["summary", "fixed", "balances"] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];
export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = { summary: "대시보드 요약(세부 항목 포함)", fixed: "고정지출 목록", balances: "자산·부채" };

export interface ShareMasks {
  /** 모든 금액을 숨긴다 */
  amounts: boolean;
  /** 메모·기관명(카드사·은행명)을 숨긴다 */
  details: boolean;
}

/** DB 의 scopes 값 → 알려진 섹션만. 형식이 이상하면 빈 목록(아무것도 보여 주지 않음). */
export function normalizeScopes(raw: unknown): ShareScope[] {
  if (!Array.isArray(raw)) return [];
  return SHARE_SCOPES.filter((s) => raw.includes(s));
}

/** DB 의 masks 값 → 가림 설정. 값이 없거나 이상하면 가리는 쪽(true)으로 본다. */
export function normalizeMasks(raw: unknown): ShareMasks {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { amounts: obj.amounts !== false, details: obj.details !== false };
}

export const SHARE_PERIOD_MODES = ["current", "month", "range"] as const;
export type SharePeriodMode = (typeof SHARE_PERIOD_MODES)[number];
/** 기간 범위(range)의 최대 개월 수 */
export const MAX_SHARE_MONTHS = 12;

export interface SharePeriod {
  mode: SharePeriodMode;
  /** month·range 의 시작 달 (current 는 null) */
  start: string | null;
  /** month·range 의 끝 달 (month 는 start 와 같다, current 는 null) */
  end: string | null;
}

export const CURRENT_PERIOD: SharePeriod = { mode: "current", start: null, end: null };

/**
 * DB 의 기간 값 → 기간. 열이 없거나(0007 전) mode 가 없으면 current. 형식·순서·개수가 어긋나면 null(공유 보기를 열지 않는다).
 * 저장된 값을 믿지 않고 읽을 때마다 다시 검사한다.
 */
export function normalizePeriod(mode: unknown, start: unknown, end: unknown): SharePeriod | null {
  const isMonth = (v: unknown): v is string => typeof v === "string" && MONTH_RE.test(v);
  if (mode === null || mode === undefined || mode === "current") return (start ?? null) === null && (end ?? null) === null ? CURRENT_PERIOD : null;
  if (mode === "month") return isMonth(start) && end === start ? { mode, start, end: start } : null;
  if (mode === "range") {
    if (!isMonth(start) || !isMonth(end) || start > end || monthDiff(end, start) + 1 > MAX_SHARE_MONTHS) return null;
    return { mode, start, end };
  }
  return null;
}

/** 기간의 달 목록 (current 는 today 가 속한 달 하나) */
export function periodMonths(period: SharePeriod, today: string): string[] {
  if (period.mode === "current") return [monthOf(today)];
  return monthsBetween(period.start as string, period.end as string);
}

export function periodLabel(period: SharePeriod): string {
  if (period.mode === "current") return "열람 시점의 이번 달";
  if (period.mode === "month") return monthLabel(period.start as string);
  return `${monthLabel(period.start as string)} ~ ${monthLabel(period.end as string)}`;
}

export interface ShareInput {
  label: string;
  scopes: ShareScope[];
  masks: ShareMasks;
  expiresAt: Date | null;
  period: SharePeriod;
}

/** 생성 폼의 기간: period_mode(current|month|range), period_month, period_start·period_end. 달은 이번 달 −120 ~ +12, 범위는 최대 12개월 */
export function parseSharePeriod(fields: Fields, today: string): { ok: true; value: SharePeriod } | { ok: false; error: string } {
  const mode = (fields.period_mode ?? "current").trim() || "current";
  if (mode === "current") return { ok: true, value: CURRENT_PERIOD };
  if (mode === "month") {
    const m = (fields.period_month ?? "").trim();
    if (!monthInEditableRange(m, today)) return { ok: false, error: "공유할 달을 이번 달 기준 10년 전부터 12개월 뒤 사이에서 골라 주세요." };
    return { ok: true, value: { mode: "month", start: m, end: m } };
  }
  if (mode === "range") {
    const start = (fields.period_start ?? "").trim();
    const end = (fields.period_end ?? "").trim();
    if (!monthInEditableRange(start, today) || !monthInEditableRange(end, today)) {
      return { ok: false, error: "시작·끝 달을 이번 달 기준 10년 전부터 12개월 뒤 사이에서 골라 주세요." };
    }
    if (start > end) return { ok: false, error: "시작 달이 끝 달보다 늦을 수 없습니다." };
    if (monthDiff(end, start) + 1 > MAX_SHARE_MONTHS) return { ok: false, error: `기간은 최대 ${MAX_SHARE_MONTHS}개월입니다.` };
    return { ok: true, value: { mode: "range", start, end } };
  }
  return { ok: false, error: "기간을 선택해 주세요." };
}

/** 공유 링크 생성 폼. 체크박스: scope_summary / scope_fixed / scope_balances, mask_amounts / mask_details. 만료: expires = 7|30|90|never */
export function parseShareInput(fields: Fields, now: Date): Validation<ShareInput> {
  const errors: Record<string, string> = {};
  const label = cleanText(fields.label, 60);
  if (label === undefined) errors.label = "이름은 60자 이하로 입력해 주세요.";
  const on = (key: string): boolean => fields[key] === "on" || fields[key] === "1" || fields[key] === "true";
  const scopes = SHARE_SCOPES.filter((s) => on(`scope_${s}`));
  if (scopes.length === 0) errors.scopes = "공유할 항목을 하나 이상 선택해 주세요.";
  const expiry = expiryFrom(fields.expires, now);
  if (!expiry.ok) errors.expires = "만료 기간을 선택해 주세요.";
  const period = parseSharePeriod(fields, seoulToday(now));
  if (!period.ok) errors.period = period.error;
  if (Object.keys(errors).length > 0 || !expiry.ok || !period.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      label: label ?? "공유 링크",
      scopes,
      masks: { amounts: on("mask_amounts"), details: on("mask_details") },
      expiresAt: expiry.expiresAt,
      period: period.value,
    },
  };
}
