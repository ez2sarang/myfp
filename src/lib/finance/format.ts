// 화면 표시용 서식 (순수 모듈).
const krw = new Intl.NumberFormat("ko-KR");

export function formatKRW(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${krw.format(value)}원`;
}

/** 큰 금액을 "1,234만원" 처럼 짧게 (차트 축·요약 카드용). */
export function formatKRWShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(abs >= 1_000_000_000 ? 0 : 1)}억원`;
  if (abs >= 10_000) return `${sign}${krw.format(Math.round(abs / 10_000))}만원`;
  return `${sign}${krw.format(abs)}원`;
}

export function formatBillingDay(day: number | null, cycle: "monthly" | "yearly", month: number | null): string {
  if (day === null) return "미정";
  const dayText = day >= 31 ? "말일" : `${day}일`;
  return cycle === "yearly" ? `매년 ${month ?? "?"}월 ${dayText}` : `매월 ${dayText}`;
}

export function formatDate(value: string | null | undefined): string {
  return value ? value.replace(/-/g, ".") : "—";
}
