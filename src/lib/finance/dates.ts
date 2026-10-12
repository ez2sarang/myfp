// 날짜 계산 (순수 모듈). 날짜는 "YYYY-MM-DD" 문자열(달력 날짜)로 다룬다. 시각대 혼동을 막으려고 Date 객체는 UTC 자정으로만 쓴다.
// "오늘"은 항상 Asia/Seoul 기준이다.

export const SEOUL_TZ = "Asia/Seoul";
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const seoulFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: SEOUL_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** 주어진 순간의 서울 달력 날짜 */
export function seoulToday(now: Date = new Date()): string {
  return seoulFormatter.format(now);
}

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseYmd(value: string): YMD | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isValidDate(value: unknown): value is string {
  return typeof value === "string" && parseYmd(value) !== null;
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 납부일(1–31)을 그 달의 실제 날짜로: 31 은 말일, 30 도 2월이면 말일. */
export function dueDay(y: number, m: number, billingDay: number): number {
  return Math.min(billingDay, daysInMonth(y, m));
}

/** 월을 더한다 (연도 넘김 처리). 결과는 { y, m } */
export function addMonths(y: number, m: number, months: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + months;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

export function addDays(date: string, days: number): string {
  const p = parseYmd(date);
  if (!p) throw new Error("날짜 형식이 올바르지 않습니다.");
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return formatYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** a - b (일) */
export function diffDays(a: string, b: string): number {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  if (!pa || !pb) throw new Error("날짜 형식이 올바르지 않습니다.");
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86_400_000);
}
