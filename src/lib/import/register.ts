// 사진 인식 등록 (서버 전용, Db 주입): 확인 화면이 보낸 JSON 항목만 받아, 대상별 기존 검증 함수로 검증하고
// 한 트랜잭션 안에서 기존 생성 쿼리로 저장한다. 사진·인식 원문·상자 좌표는 받지 않는다(허용 필드 밖은 거부).
// 소유자는 언제나 서버 세션의 사용자 id(userId 인자)이고, 입력에서 사용자 id 를 읽지 않는다.
import { writeAudit } from "../db/queries/audit.ts";
import { createBalance, listBalances } from "../db/queries/balance.ts";
import { createFixed, listFixed } from "../db/queries/fixed.ts";
import { createPlanned, listPlanned } from "../db/queries/monthly.ts";
import type { Db } from "../db/types.ts";
import { parsePlannedInput, type PlannedInput } from "../finance/monthly-validate.ts";
import { LIMITS } from "../finance/types.ts";
import { parseBalanceInput, parseFixedInput, type BalanceInput, type FixedInput } from "../finance/validate.ts";

export const IMPORT_MAX_ITEMS = 100;
/** JSON 문자열 길이 상한 (항목 100건 × 넉넉한 필드 길이) */
export const IMPORT_MAX_CHARS = 100_000;

export const IMPORT_TARGETS = ["fixed", "planned", "asset", "liability"] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number];

/** 대상별로 받는 필드. 이 밖의 필드(원문·상자·이미지·사용자 id 등)가 하나라도 있으면 그 항목은 거부한다 */
export const IMPORT_FIELDS: Readonly<Record<ImportTarget, readonly string[]>> = {
  fixed: ["target", "name", "amount", "category", "billingDay", "paymentMethod"],
  planned: ["target", "name", "amount", "category", "dueDate", "count"],
  asset: ["target", "name", "amount", "category", "asOf"],
  liability: ["target", "name", "amount", "category", "asOf"],
};
const TOP_FIELDS = ["items", "private", "confirmDuplicates"];

export type ImportItem =
  | { target: "fixed"; input: FixedInput }
  | { target: "planned"; input: PlannedInput }
  | { target: "asset" | "liability"; input: BalanceInput };

export interface ImportPlan {
  items: ImportItem[];
  private: boolean;
  confirmDuplicates: boolean;
}

export interface RowError {
  index: number;
  message: string;
}

export type ImportParse = { ok: true; value: ImportPlan } | { ok: false; message: string; rowErrors?: RowError[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const intStr = (v: unknown): string | undefined => (typeof v === "number" && Number.isSafeInteger(v) ? String(v) : undefined);
const optional = (v: unknown, read: (x: unknown) => string | undefined): string | undefined => (v === null || v === undefined ? "" : read(v));

function parseItem(raw: unknown, isPrivate: boolean, today: string): { ok: true; item: ImportItem } | { ok: false; message: string } {
  if (!isRecord(raw)) return { ok: false, message: "항목 형식이 올바르지 않습니다." };
  const target = raw.target;
  if (typeof target !== "string" || !(IMPORT_TARGETS as readonly string[]).includes(target)) return { ok: false, message: "등록 대상을 선택해 주세요." };
  const allowed = IMPORT_FIELDS[target as ImportTarget];
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) return { ok: false, message: "알 수 없는 필드가 있습니다." };
  const name = str(raw.name);
  const amount = intStr(raw.amount);
  const category = str(raw.category);
  if (name === undefined || amount === undefined || category === undefined) return { ok: false, message: "이름·금액·분류를 확인해 주세요." };
  const first = (errors: Record<string, string>) => Object.values(errors)[0] ?? "입력값을 확인해 주세요.";
  if (target === "fixed") {
    const billingDay = optional(raw.billingDay, intStr);
    const paymentMethod = optional(raw.paymentMethod, str);
    if (billingDay === undefined || paymentMethod === undefined) return { ok: false, message: "납부일·결제수단 형식이 올바르지 않습니다." };
    const parsed = parseFixedInput(
      { name, amount, category, cycle: "monthly", billing_day: billingDay, payment_method: paymentMethod, source: "user", private: isPrivate ? "on" : "" },
      today,
      { activeDefault: true },
    );
    return parsed.ok ? { ok: true, item: { target, input: parsed.value } } : { ok: false, message: first(parsed.errors) };
  }
  if (target === "planned") {
    const dueDate = str(raw.dueDate);
    const count = optional(raw.count, intStr);
    if (dueDate === undefined || count === undefined) return { ok: false, message: "날짜·분할 횟수 형식이 올바르지 않습니다." };
    const parsed = parsePlannedInput({ name, amount, category, dueDate, count }, today, { allowCount: true });
    return parsed.ok ? { ok: true, item: { target, input: parsed.value } } : { ok: false, message: first(parsed.errors) };
  }
  const asOf = optional(raw.asOf, str);
  if (asOf === undefined) return { ok: false, message: "기준일 형식이 올바르지 않습니다." };
  const kind = target === "asset" ? "asset" : "liability";
  const parsed = parseBalanceInput({ kind, category, name, amount, as_of: asOf, private: isPrivate ? "on" : "" });
  return parsed.ok ? { ok: true, item: { target: target as "asset" | "liability", input: parsed.value } } : { ok: false, message: first(parsed.errors) };
}

/** 확인 화면이 보낸 JSON 문자열 → 검증한 등록 계획. 한 항목이라도 틀리면 전체를 거부하고 항목 위치·사유를 돌려준다 */
export function parseImportPayload(raw: unknown, today: string): ImportParse {
  if (typeof raw !== "string") return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  if (raw.length > IMPORT_MAX_CHARS) return { ok: false, message: "한 번에 보낼 수 있는 양을 넘었습니다." };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  }
  if (!isRecord(body) || Object.keys(body).some((k) => !TOP_FIELDS.includes(k)) || !Array.isArray(body.items)) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  }
  if (body.items.length === 0) return { ok: false, message: "등록할 항목을 골라 주세요." };
  if (body.items.length > IMPORT_MAX_ITEMS) return { ok: false, message: `한 번에 최대 ${IMPORT_MAX_ITEMS}건까지 등록할 수 있습니다.` };
  if ((body.private !== undefined && typeof body.private !== "boolean") || (body.confirmDuplicates !== undefined && typeof body.confirmDuplicates !== "boolean")) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  }
  const isPrivate = body.private === true;
  const items: ImportItem[] = [];
  const rowErrors: RowError[] = [];
  body.items.forEach((raw, index) => {
    const parsed = parseItem(raw, isPrivate, today);
    if (parsed.ok) items.push(parsed.item);
    else rowErrors.push({ index, message: parsed.message });
  });
  if (rowErrors.length > 0) return { ok: false, message: "입력값을 확인해 주세요.", rowErrors };
  return { ok: true, value: { items, private: isPrivate, confirmDuplicates: body.confirmDuplicates === true } };
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

/** 이미 있는 항목과 이름·금액이 같은 항목의 위치(경고용, 저장 여부는 사용자가 정한다). 읽기만 한다 */
export async function possibleDuplicates(db: Db, userId: string, items: readonly ImportItem[]): Promise<number[]> {
  const need = new Set(items.map((i) => (i.target === "asset" || i.target === "liability" ? "balance" : i.target)));
  const [fixed, planned, balances] = await Promise.all([
    need.has("fixed") ? listFixed(db, userId) : [],
    need.has("planned") ? listPlanned(db, userId) : [],
    need.has("balance") ? listBalances(db, userId) : [],
  ]);
  const out: number[] = [];
  items.forEach((item, index) => {
    const { name, amount } = item.input;
    const pool =
      item.target === "fixed" ? fixed : item.target === "planned" ? planned : balances.filter((b) => b.kind === (item.target === "asset" ? "asset" : "liability"));
    if (pool.some((e) => e.amount === amount && sameName(e.name, name))) out.push(index);
  });
  return out;
}

export interface ImportCounts {
  fixed: number;
  /** 예정지출 행 수 (분할이면 회차마다 한 행) */
  planned: number;
  asset: number;
  liability: number;
}

/** 저장 중 상한을 넘으면 던져서 트랜잭션 전체를 되돌린다 */
export class ImportLimitError extends Error {
  readonly index: number;
  readonly target: ImportTarget;
  constructor(index: number, target: ImportTarget) {
    super("limit");
    this.index = index;
    this.target = target;
  }
}

export const LIMIT_MESSAGES: Record<ImportTarget, string> = {
  fixed: `고정지출은 최대 ${LIMITS.fixedExpenses}건까지 등록할 수 있습니다.`,
  planned: `예정지출은 최대 ${LIMITS.plannedExpenses}건까지 등록할 수 있습니다.`,
  asset: `자산·부채는 최대 ${LIMITS.balanceItems}건까지 등록할 수 있습니다.`,
  liability: `자산·부채는 최대 ${LIMITS.balanceItems}건까지 등록할 수 있습니다.`,
};

/** 트랜잭션 안에서 부른다: 항목을 차례로 저장하고(하나라도 실패하면 던져서 전체 되돌림), 감사 기록에는 대상별 건수만 남긴다 */
export async function saveImport(tx: Db, userId: string, items: readonly ImportItem[]): Promise<ImportCounts> {
  const counts: ImportCounts = { fixed: 0, planned: 0, asset: 0, liability: 0 };
  for (const [index, item] of items.entries()) {
    if (item.target === "fixed") {
      const result = await createFixed(tx, userId, item.input);
      if (!result.ok) throw new ImportLimitError(index, item.target);
      counts.fixed += 1;
    } else if (item.target === "planned") {
      const result = await createPlanned(tx, userId, item.input);
      if (!result.ok) throw new ImportLimitError(index, item.target);
      counts.planned += result.count;
    } else {
      const result = await createBalance(tx, userId, item.input);
      if (!result.ok) throw new ImportLimitError(index, item.target);
      counts[item.target] += 1;
    }
  }
  await writeAudit(tx, { actorUserId: userId, action: "import.photo", targetType: "user", targetKey: userId, after: { items: items.length, ...counts } });
  return counts;
}
