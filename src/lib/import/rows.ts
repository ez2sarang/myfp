// 확인 화면의 행 상태 (순수 모듈, 화면·시험 공용): 후보 → 기본 행(대상·분류·선택), 노랑 강조, 행 → 등록 요청 JSON.
// 기본 선택은 신뢰도 '높음'만이고, '낮음'(손글씨 포함)은 일괄 선택에서도 빠진다. 사용자가 고친 값이 최종값이다.
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  LIABILITY_CATEGORIES,
  LIABILITY_CATEGORY_LABELS,
  PAYMENT_METHODS,
} from "../finance/types.ts";
import { IMPORT_MAX_ITEMS, type ImportCandidate, type ImportTarget, type Layout, type Reason } from "./types.ts";

export type RowTarget = ImportTarget | "skip";

export interface RowState {
  /** `${캡처}:${그 캡처 안의 순서}` */
  key: string;
  selected: boolean;
  target: RowTarget;
  category: string;
  name: string;
  /** 손글씨 이름은 입력칸이 아니라 회색 제안으로만 보여 준다 */
  nameHint: string;
  amount: string;
  date: string;
  /** 예정지출 분할 횟수 */
  count: string;
  paymentMethod: "" | (typeof PAYMENT_METHODS)[number];
}

export function categoriesFor(target: RowTarget): readonly string[] {
  if (target === "asset") return ASSET_CATEGORIES;
  if (target === "liability") return LIABILITY_CATEGORIES;
  if (target === "skip") return [];
  return EXPENSE_CATEGORIES;
}

/** 대상별 분류 이름. 대상마다 표가 다르다(지출 'other' = 기타, 부채 'other' = 기타 부채 — 표를 합치면 서로 덮어쓴다) */
export function categoryLabel(target: RowTarget, category: string): string {
  const labels: Record<string, string> =
    target === "asset" ? ASSET_CATEGORY_LABELS : target === "liability" ? LIABILITY_CATEGORY_LABELS : target === "skip" ? {} : EXPENSE_CATEGORY_LABELS;
  return labels[category] ?? category;
}

/** 대상을 바꿀 때의 기본 분류 */
export function defaultCategory(target: RowTarget): string {
  if (target === "asset") return "deposit";
  if (target === "liability") return "other";
  if (target === "skip") return "";
  return "other";
}

/** 제안 분류 → 대상·분류. 취소(상계)·분류 안 함은 등록하지 않는 '제외' */
export function targetOf(c: ImportCandidate): { target: RowTarget; category: string } {
  const s = c.suggestion;
  if (s.kind === "fixed") return { target: "fixed", category: s.category };
  if (s.kind === "planned") return { target: "planned", category: "other" };
  if (s.kind === "asset") return { target: "asset", category: s.category };
  if (s.kind === "liability") return { target: "liability", category: s.category };
  return { target: "skip", category: "" };
}

/** 일괄 선택 대상: '낮음'·제외가 아닌 행 */
export const canBulkSelect = (c: ImportCandidate, row: Pick<RowState, "target">): boolean => c.confidence !== "low" && row.target !== "skip";

export function defaultRow(c: ImportCandidate, key: string): RowState {
  const { target, category } = targetOf(c);
  const handwriting = c.layout === "handwriting";
  const remaining = c.installment?.current && c.installment.total ? c.installment.total - c.installment.current + 1 : 1;
  return {
    key,
    selected: c.confidence === "high" && target !== "skip",
    target,
    category,
    name: handwriting ? "" : c.name,
    nameHint: c.name,
    amount: c.amount === null ? "" : String(c.amount),
    date: c.date ?? "",
    count: String(Math.min(36, Math.max(1, remaining))),
    paymentMethod: c.layout === "card" ? "card" : "",
  };
}

const AMOUNT_REASONS: readonly Reason[] = ["corrected", "format", "photo", "handwriting", "sum-mismatch", "duplicate", "no-amount", "total-mismatch"];
const DATE_REASONS: readonly Reason[] = ["date-inherited", "day-range", "no-date", "day-order"];

/** 노랑 강조할 칸 (보고서 6.8): 금액 = 보정·형식 위반·사진/손글씨·품목 합≠합계·중복 의심·손글씨 합계 불일치,
 *  날짜 = 이어받음·말일 초과·없음·손글씨 일 순서 어긋남 */
export function highlights(c: ImportCandidate): { amount: boolean; date: boolean; name: boolean } {
  return {
    amount: c.reasons.some((r) => AMOUNT_REASONS.includes(r)),
    date: c.reasons.some((r) => DATE_REASONS.includes(r)),
    name: c.layout === "handwriting",
  };
}

export const REASON_LABELS: Record<Reason, string> = {
  corrected: "금액 보정",
  "date-inherited": "날짜 이어받음",
  "no-date": "날짜 없음",
  photo: "사진",
  "sum-mismatch": "품목 합≠합계",
  duplicate: "중복 의심",
  "no-amount": "금액 없음",
  format: "금액 형식",
  "day-range": "말일 초과",
  handwriting: "손글씨",
  "day-order": "일이 위 행보다 앞서요",
  "total-mismatch": "합계와 불일치",
};

export const HANDWRITING_NOTICE = "손글씨는 인식이 부정확할 수 있어요. 금액과 날짜를 꼭 확인해 주세요.";
export const TOTAL_MISMATCH_NOTICE = "적어 둔 합계와 읽은 금액의 합이 달라요. 금액을 확인해 주세요.";

/** 사진 한 장 위에 띄울 주의 줄: 손글씨(자동 판정·사용자 선택)면 인식 주의, 그 사진 후보에 합계 불일치가 있으면 경고 */
export function photoNotices(layout: Layout, candidates: readonly ImportCandidate[]): string[] {
  const out: string[] = [];
  if (layout === "handwriting") out.push(HANDWRITING_NOTICE);
  if (candidates.some((c) => c.reasons.includes("total-mismatch"))) out.push(TOTAL_MISMATCH_NOTICE);
  return out;
}

export const CONFIDENCE_LABELS = { high: "높음", check: "확인 필요", low: "낮음" } as const;

export type PayloadResult = { ok: true; payload: string; keys: string[] } | { ok: false; key: string | null; message: string };

/** 선택한 행 → 등록 요청 JSON (서버가 다시 검증한다). 금액은 쉼표·원을 뺀 숫자만 */
export function toPayload(rows: readonly RowState[], opts: { private: boolean; confirmDuplicates: boolean }): PayloadResult {
  const chosen = rows.filter((r) => r.selected && r.target !== "skip");
  if (chosen.length === 0) return { ok: false, key: null, message: "등록할 항목을 골라 주세요." };
  if (chosen.length > IMPORT_MAX_ITEMS) return { ok: false, key: null, message: `한 번에 최대 ${IMPORT_MAX_ITEMS}건까지 등록할 수 있습니다.` };
  const items: Record<string, unknown>[] = [];
  for (const r of chosen) {
    const digits = r.amount.replace(/[\s,원₩]/g, "");
    if (!/^\d{1,13}$/.test(digits)) return { ok: false, key: r.key, message: "금액을 숫자로 입력해 주세요." };
    const name = r.name.trim();
    if (!name) return { ok: false, key: r.key, message: "이름을 입력해 주세요." };
    const base = { target: r.target, name, amount: Number(digits), category: r.category };
    if (r.target === "fixed") {
      items.push({ ...base, billingDay: r.date ? Number(r.date.slice(8, 10)) : null, paymentMethod: r.paymentMethod || null });
    } else if (r.target === "planned") {
      if (!r.date) return { ok: false, key: r.key, message: "예정일을 입력해 주세요." };
      items.push({ ...base, dueDate: r.date, count: Number(r.count) || 1 });
    } else {
      items.push({ ...base, asOf: r.date || null });
    }
  }
  return { ok: true, payload: JSON.stringify({ items, private: opts.private, confirmDuplicates: opts.confirmDuplicates }), keys: chosen.map((r) => r.key) };
}
