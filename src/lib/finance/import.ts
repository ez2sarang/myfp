// 개인 데이터 시드(seed.json) 정규화 (순수 모듈). scripts/import-private.mjs 가 쓴다. 시드 파일은 저장소 밖에 둔다.
// 화면 입력과 같은 검증(parseFixedInput/parseBalanceInput)을 거치고, 남은 횟수는 시드의 as_of 기준으로 종료일로 바꾼다.
// 오류 메시지에는 항목 키와 필드 이름만 담는다(금액·이름 같은 값은 담지 않는다).
import { parseAdminEmails } from "../auth-core/admin-emails.ts";
import { isValidDate } from "./dates.ts";
import { parseBalanceInput, parseFixedInput, type BalanceInput, type FixedInput } from "./validate.ts";

export interface NormalizedSeed {
  ownerEmail: string;
  asOf: string;
  fixed: { externalKey: string; input: FixedInput }[];
  balances: { externalKey: string; input: BalanceInput }[];
}

export type SeedResult = { ok: true; value: NormalizedSeed } | { ok: false; errors: string[] };

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;

const str = (value: unknown): string | undefined =>
  value === null || value === undefined ? "" : typeof value === "string" || typeof value === "number" ? String(value) : undefined;

function fieldsOf(raw: Record<string, unknown>, keys: readonly string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = str(raw[key]);
    if (value === undefined) return null;
    out[key] = value;
  }
  return out;
}

const FIXED_KEYS = [
  "name",
  "category",
  "amount",
  "cycle",
  "billing_day",
  "billing_month",
  "payment_method",
  "institution",
  "start_date",
  "end_date",
  "remaining_count",
  "note",
  "source",
] as const;
const BALANCE_KEYS = ["category", "name", "amount", "as_of", "note", "monthly_payment", "interest_rate", "end_date"] as const;

export function normalizeSeed(seed: unknown, adminEmailsRaw: string | undefined): SeedResult {
  const errors: string[] = [];
  if (typeof seed !== "object" || seed === null) return { ok: false, errors: ["시드 형식이 객체가 아닙니다."] };
  const s = seed as Record<string, unknown>;
  if (s.version !== 1) errors.push("version 은 1 이어야 합니다.");
  if (s.currency !== undefined && s.currency !== "KRW") errors.push("currency 는 KRW 만 지원합니다.");
  const asOf = typeof s.as_of === "string" && isValidDate(s.as_of) ? s.as_of : null;
  if (!asOf) errors.push("as_of 는 YYYY-MM-DD 날짜여야 합니다.");
  if (s.owner_email_from_env !== "ADMIN_EMAILS") errors.push('owner_email_from_env 는 "ADMIN_EMAILS" 여야 합니다.');
  const ownerEmail = parseAdminEmails(adminEmailsRaw)[0] ?? null;
  if (!ownerEmail) errors.push("환경 변수 ADMIN_EMAILS 에 소유자 이메일이 없습니다.");

  const fixed: NormalizedSeed["fixed"] = [];
  const balances: NormalizedSeed["balances"] = [];
  const seen = new Set<string>();
  const keyOf = (raw: Record<string, unknown>, where: string, index: number): string | null => {
    const key = raw.key;
    if (typeof key !== "string" || !KEY_RE.test(key)) {
      errors.push(`${where}[${index}]: key 는 소문자·숫자·-·_·. 로 된 80자 이하여야 합니다.`);
      return null;
    }
    if (seen.has(`${where}:${key}`)) {
      errors.push(`${where}[${index}]: key 가 중복됩니다 (${key}).`);
      return null;
    }
    seen.add(`${where}:${key}`);
    return key;
  };

  const list = (value: unknown, where: string): Record<string, unknown>[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      errors.push(`${where} 는 배열이어야 합니다.`);
      return [];
    }
    return value.filter((v, i) => {
      const ok = typeof v === "object" && v !== null;
      if (!ok) errors.push(`${where}[${i}]: 객체가 아닙니다.`);
      return ok;
    }) as Record<string, unknown>[];
  };

  list(s.fixed_expenses, "fixed_expenses").forEach((raw, i) => {
    const key = keyOf(raw, "fixed_expenses", i);
    const fields = fieldsOf(raw, FIXED_KEYS);
    if (!fields) {
      errors.push(`fixed_expenses[${i}]: 문자열·숫자가 아닌 값이 있습니다.`);
      return;
    }
    if (raw.active === false) fields.active = "";
    else if (raw.active === true || raw.active === undefined) fields.active = "on";
    const parsed = parseFixedInput(fields, asOf ?? "1970-01-01", { activeDefault: true });
    if (!parsed.ok) errors.push(`fixed_expenses[${i}] (${key ?? "?"}): 잘못된 필드 ${Object.keys(parsed.errors).join(", ")}`);
    else if (key) fixed.push({ externalKey: key, input: parsed.value });
  });

  for (const [where, kind] of [
    ["assets", "asset"],
    ["liabilities", "liability"],
  ] as const) {
    list(s[where], where).forEach((raw, i) => {
      const key = keyOf(raw, where, i);
      const fields = fieldsOf(raw, BALANCE_KEYS);
      if (!fields) {
        errors.push(`${where}[${i}]: 문자열·숫자가 아닌 값이 있습니다.`);
        return;
      }
      const parsed = parseBalanceInput({ ...fields, kind });
      if (!parsed.ok) errors.push(`${where}[${i}] (${key ?? "?"}): 잘못된 필드 ${Object.keys(parsed.errors).join(", ")}`);
      else if (key) balances.push({ externalKey: key, input: parsed.value });
    });
  }

  if (errors.length > 0 || !asOf || !ownerEmail) return { ok: false, errors };
  return { ok: true, value: { ownerEmail, asOf, fixed, balances } };
}
