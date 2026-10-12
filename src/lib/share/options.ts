// 공유 링크 설정: 포함 섹션(scopes)과 가림(masks) (순수 모듈). DB 의 jsonb 값은 신뢰하지 않고 읽을 때마다 이 함수로 다시 정규화한다.
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

export interface ShareInput {
  label: string;
  scopes: ShareScope[];
  masks: ShareMasks;
  expiresAt: Date | null;
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
  if (Object.keys(errors).length > 0 || !expiry.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      label: label ?? "공유 링크",
      scopes,
      masks: { amounts: on("mask_amounts"), details: on("mask_details") },
      expiresAt: expiry.expiresAt,
    },
  };
}
