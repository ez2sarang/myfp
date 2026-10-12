// 인식 글자 정규화 (순수 모듈): 금액·날짜·할부·취소 신호. 보고서 7절 규칙.
//  - 금액 형식: -?₩?N,NNN원? (천 단위 쉼표). 숫자 사이의 O/o→0, l/I/|→1, 천 단위 자리의 . ' ’ → , 보정. 보정했으면 corrected.
//  - 날짜 세 형식: N월 N일 / YYYY.MM.DD(- / 도 허용, 뒤에 HH:MM) / MM.DD (요일). 연도가 없으면 캡처일(today)의 연도, 그 결과가 미래면 전년.
//    일은 그 달 말일 이내여야 한다(아니면 dayInRange=false, date=null).
import { daysInMonth, formatYmd, parseYmd } from "../finance/dates.ts";

export interface AmountResult {
  /** 원 단위 절댓값 */
  value: number;
  negative: boolean;
  /** 오인식 보정(O→0 등, 천 단위 구분자 교체)을 적용했는지 */
  corrected: boolean;
  /** 천 단위 쉼표 형식을 지켰는지 (만 단위 표기는 형식 검사 대상이 아니다) */
  valid: boolean;
  hasWon: boolean;
}

const CORE = String.raw`\d(?:[\d,.'’OolI|]*\d)?`;
const WHOLE_AMOUNT = new RegExp(String.raw`^([-−]?)\s*₩?\s*([-−]?)\s*(${CORE})\s*(원?)$`);
const ANY_AMOUNT = new RegExp(String.raw`([-−]?)\s*₩?\s*(${CORE})\s*(만\s*원|만|원)?`, "g");

function readCore(core: string): { value: number; corrected: boolean; valid: boolean } {
  const fixed = core.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1");
  let corrected = fixed !== core;
  let valid: boolean;
  let digits: string;
  if (/^\d{1,3}([.,'’]\d{3})+$/.test(fixed)) {
    if (/[.'’]/.test(fixed)) corrected = true;
    valid = true;
    digits = fixed.replace(/[.,'’]/g, "");
  } else {
    valid = /^\d{1,3}$/.test(fixed);
    digits = fixed.replace(/\D/g, "");
  }
  return { value: Number(digits), corrected, valid };
}

/** 글자 전체가 금액 하나일 때 (카드 앱의 `12,000원` 상자 등). 아니면 null */
export function parseAmount(text: string): AmountResult | null {
  const m = WHOLE_AMOUNT.exec(text.trim());
  if (!m) return null;
  const core = readCore(m[3] as string);
  return { ...core, negative: Boolean(m[1] || m[2]), hasWon: m[4] === "원" };
}

export interface AmountMatch extends AmountResult {
  start: number;
  end: number;
}

/** 글자 안의 금액 후보 전부(왼→오른). outsideParens 이면 괄호 안은 건너뛴다. 만 단위(30만원)는 ×10,000 */
export function amountsIn(text: string, { outsideParens = false } = {}): AmountMatch[] {
  const depthAt: number[] = [];
  let depth = 0;
  for (const ch of text) {
    if (ch === "(" || ch === "（") depth += 1;
    depthAt.push(depth);
    if ((ch === ")" || ch === "）") && depth > 0) depth -= 1;
  }
  const out: AmountMatch[] = [];
  for (const m of text.matchAll(ANY_AMOUNT)) {
    const start = m.index ?? 0;
    const coreStart = start + (m[0] as string).indexOf(m[2] as string);
    if (outsideParens && (depthAt[coreStart] ?? 0) > 0) continue;
    const unit = (m[3] ?? "").replace(/\s/g, "");
    const core = readCore(m[2] as string);
    const man = unit.startsWith("만");
    out.push({
      value: man ? core.value * 10_000 : core.value,
      negative: m[1] === "-" || m[1] === "−",
      corrected: core.corrected,
      valid: man ? /^\d+$/.test(m[2] as string) : core.valid,
      hasWon: unit.endsWith("원"),
      start,
      end: start + (m[0] as string).length,
    });
  }
  return out;
}

export interface DateResult {
  /** YYYY-MM-DD, 일이 범위 밖이면 null */
  date: string | null;
  month: number;
  day: number;
  hasYear: boolean;
  time: string | null;
  dayInRange: boolean;
  format: "md" | "ymd" | "md-weekday";
  /** 원문 안 위치 (같은 줄의 다른 글자를 이름으로 쓸 때) */
  start: number;
  end: number;
}

const DATE_FORMATS: { format: DateResult["format"]; re: RegExp }[] = [
  { format: "ymd", re: /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?(?:\s*(\d{1,2}):(\d{2}))?/ },
  { format: "md", re: /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/ },
  { format: "md-weekday", re: /()(\d{1,2})\s*\.\s*(\d{1,2})\s*\(\s*[월화수목금토일]\s*\)/ },
];

/** 글자 안의 첫 날짜 (세 형식 중 가장 앞에 나오는 것) */
export function parseDate(text: string, today: string): DateResult | null {
  const base = parseYmd(today);
  if (!base) throw new Error("today 는 YYYY-MM-DD 여야 합니다.");
  let best: { format: DateResult["format"]; m: RegExpExecArray } | null = null;
  for (const { format, re } of DATE_FORMATS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.m.index)) best = { format, m };
  }
  if (!best) return null;
  const { format, m } = best;
  const hasYear = Boolean(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const time = m[4] !== undefined && m[5] !== undefined && Number(m[4]) < 24 ? `${m[4].padStart(2, "0")}:${m[5]}` : null;
  let year = hasYear ? Number(m[1]) : base.y;
  const dayInRange = month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  let date = dayInRange ? formatYmd(year, month, day) : null;
  if (date && !hasYear && date > today) {
    year -= 1;
    date = day <= daysInMonth(year, month) ? formatYmd(year, month, day) : null;
  }
  return { date, month, day, hasYear, time, dayInRange: date !== null, format, start: m.index, end: m.index + m[0].length };
}

/** 일만 아는 경우(손글씨 행·월 맥락): 연·월은 맥락에서, 미래면 전년 */
export function dateFromDay(month: number, day: number, today: string): { date: string | null; dayInRange: boolean } {
  const base = parseYmd(today);
  if (!base) throw new Error("today 는 YYYY-MM-DD 여야 합니다.");
  let year = base.y;
  if (month < 1 || month > 12) return { date: null, dayInRange: false };
  if (formatYmd(year, month, 1) > today) year -= 1;
  const ok = day >= 1 && day <= daysInMonth(year, month);
  return { date: ok ? formatYmd(year, month, day) : null, dayInRange: ok };
}

/** 할부 표기: N/M회, N개월 할부. "할부" 문구만 있으면 회차 없이 표시 */
export function parseInstallment(text: string): { current: number | null; total: number | null } | null {
  const ratio = /(\d{1,2})\s*\/\s*(\d{1,2})\s*회/.exec(text);
  if (ratio) {
    const current = Number(ratio[1]);
    const total = Number(ratio[2]);
    if (current >= 1 && total >= 2 && current <= total) return { current, total };
  }
  const months = /(\d{1,2})\s*개월\s*할부|할부\s*(\d{1,2})\s*개월/.exec(text);
  if (months) return { current: null, total: Number(months[1] ?? months[2]) };
  return /할부/.test(text) ? { current: null, total: null } : null;
}

export const isCancelText = (text: string): boolean => /취소/.test(text);
export const hasHangul = (text: string): boolean => /[가-힣]/.test(text);
