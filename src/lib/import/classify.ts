// 항목 초안 → 등록 후보 (순수 모듈): 분류 제안·취소 상계·중복 의심·규칙 기반 신뢰도.
// 분류는 제안일 뿐이고 사용자가 확정한다. 사용자 기준(반복 서비스·대출·보험만 고정지출, 할부·일회성·단기카드대출은 제외)을 따른다:
//   취소 → 원거래와 상계 / 단기카드대출(현금서비스) → 분류 안 함 / 카드 결제예정금액 → 카드별 부채 / 고지서 품목 → 합계에 포함(분류 안 함)
//   / 대출 잔액·원금 → 부채(대출) / 할부 → 예정·일회성 / 예금·적금·투자 → 자산 / 보험·이자·상환·통신·구독·관리비·공과금 → 고정지출 / 그 밖 → 예정·일회성
// 신뢰도는 인식 점수가 아니라 규칙으로 정한다(보고서 7절).
import type { ExpenseCategory } from "../finance/types.ts";
import { parseCapture, type Draft } from "./parse.ts";
import type { CaptureContext, Confidence, ImportCandidate, OcrLineInput, Reason, Suggestion } from "./types.ts";

const SHORT_TERM_CARD_LOAN = /단기\s*카드\s*대출|현금\s*서비스/;
const CARD_BILL = /결제\s*예정|청구\s*예정|결제하실\s*금액|이번\s*달\s*결제\s*금액/;
const LOAN = /대출|융자/;
const BALANCE = /잔액|원금|대출금/;
// "저축"은 은행 이름(저축은행)에도 들어가 빼고, 상품 이름만 본다
const DEPOSIT = /예금|적금|통장|입출금|예치/;
const INVEST = /투자|주식|펀드|증권|ETF|채권/;
const FIXED_RULES: readonly [RegExp, ExpenseCategory][] = [
  [/보험/, "insurance"],
  [/이자/, "loan_interest"],
  [/원리금|상환/, "loan"],
  [/통신|휴대폰|핸드폰|휴대전화|인터넷|요금제/, "telecom"],
  [/구독|멤버십|월정액|정기\s*결제/, "subscription"],
  [/관리비|월세|임대료/, "housing"],
  [/전기|수도|가스|난방|공과금/, "utilities"],
];

/** 분류 제안 (취소의 원거래 위치는 buildCandidates 가 채운다) */
export function classify(d: Draft): Suggestion {
  const text = `${d.name} ${d.context}`;
  if (d.cancelled) return { kind: "offset", offsetOf: null };
  if (SHORT_TERM_CARD_LOAN.test(text)) return { kind: "none", why: "short-term-card-loan" };
  if (d.layout === "card" && d.role === "total" && CARD_BILL.test(text)) return { kind: "liability", category: "card" };
  if (d.layout === "bill" && d.role === "item") return { kind: "none", why: "bill-item" };
  if (d.hint === "loan-balance" || (LOAN.test(text) && BALANCE.test(text) && !/이자|상환/.test(text))) return { kind: "liability", category: "loan" };
  if (d.installment) return { kind: "planned" };
  if (INVEST.test(text)) return { kind: "asset", category: "investment" };
  if (DEPOSIT.test(text)) return { kind: "asset", category: "deposit" };
  for (const [re, category] of FIXED_RULES) if (re.test(text)) return { kind: "fixed", category };
  return { kind: "planned" };
}

/** 이름 유사도: 1 − 편집거리/긴 쪽 길이 (공백 무시) */
export function similarity(a: string, b: string): number {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  if (x === y) return 1;
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= y.length; j += 1) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[y.length]! / Math.max(x.length, y.length);
}

export const DUPLICATE_NAME_SIMILARITY = 0.85;

const LOW: readonly Reason[] = ["no-amount", "format", "day-range", "handwriting"];
const CHECK: readonly Reason[] = ["corrected", "date-inherited", "no-date", "photo", "sum-mismatch", "duplicate"];

export function confidenceOf(reasons: readonly Reason[]): Confidence {
  if (reasons.some((r) => LOW.includes(r))) return "low";
  if (reasons.some((r) => CHECK.includes(r))) return "check";
  return "high";
}

function reasonsOf(d: Draft, ctx: CaptureContext): Reason[] {
  const reasons: Reason[] = [];
  if (!d.amount) reasons.push("no-amount");
  else {
    if (d.amount.corrected) reasons.push("corrected");
    if (!d.amount.valid) reasons.push("format");
  }
  if (d.dayOutOfRange) reasons.push("day-range");
  else if (!d.date) reasons.push("no-date");
  if (d.date && d.dateSource !== "direct") reasons.push("date-inherited");
  if (ctx.source === "photo") reasons.push("photo");
  if (d.layout === "handwriting") reasons.push("handwriting");
  for (const r of d.extraReasons) if (!reasons.includes(r)) reasons.push(r);
  return reasons;
}

const withoutCancelWord = (name: string) => name.replace(/취소|승인\s*취소/g, "");

/** 캡처 여러 장 → 후보 목록. 같은 (금액, 날짜·시각) 이거나 같은 금액·같은 날(또는 날짜 없음)·이름 유사도 0.85 이상이면 앞 후보의 중복 의심 */
export function buildCandidates(captures: readonly { lines: readonly OcrLineInput[]; ctx: CaptureContext }[]): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  captures.forEach(({ lines, ctx }, capture) => {
    for (const d of parseCapture(lines, ctx)) {
      const reasons = reasonsOf(d, ctx);
      out.push({
        index: out.length,
        capture,
        layout: d.layout,
        role: d.role,
        name: d.name,
        amount: d.amount?.value ?? null,
        date: d.date,
        time: d.time,
        dateSource: d.date ? d.dateSource : null,
        installment: d.installment,
        cancelled: d.cancelled,
        corrected: Boolean(d.amount?.corrected),
        reasons,
        confidence: confidenceOf(reasons),
        suggestion: classify(d),
        duplicateOf: null,
        lines: d.lines,
        box: d.box,
      });
    }
  });
  for (const c of out) {
    if (c.suggestion.kind === "offset") {
      const original = out.find(
        (o) => !o.cancelled && o.amount === c.amount && c.amount !== null && (o.date === c.date || !o.date || !c.date) && similarity(withoutCancelWord(o.name), withoutCancelWord(c.name)) >= DUPLICATE_NAME_SIMILARITY,
      );
      c.suggestion = { kind: "offset", offsetOf: original?.index ?? null };
    }
    if (c.amount === null) continue;
    const dup = out.find((o) => {
      if (o.index >= c.index || o.amount !== c.amount || o.cancelled !== c.cancelled || o.role !== c.role) return false;
      if (o.date && c.date && o.time && c.time) return o.date === c.date && o.time === c.time;
      return (o.date === c.date || !o.date || !c.date) && similarity(o.name, c.name) >= DUPLICATE_NAME_SIMILARITY;
    });
    if (dup) {
      c.duplicateOf = dup.index;
      if (!c.reasons.includes("duplicate")) c.reasons.push("duplicate");
      c.confidence = confidenceOf(c.reasons);
    }
  }
  return out;
}
