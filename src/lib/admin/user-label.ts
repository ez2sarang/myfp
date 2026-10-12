// 관리자 사용자 목록의 표시 규칙 (순수 모듈). 이름·이메일이 없는 사용자도 서로 구분되게 짧은 사용자 id 를 붙인다.

/** 사용자 id(UUID) 앞 8자 */
export const shortUserId = (id: string): string => id.slice(0, 8);

/** 목록의 대표 이름: 표시 이름 → 공급자 이름 → 이메일 → 「이름 없음 · #짧은ID」 */
export function userPrimaryLabel(u: { id: string; displayName: string | null; name: string | null; email: string | null }): string {
  return u.displayName ?? u.name ?? u.email ?? `이름 없음 · #${shortUserId(u.id)}`;
}

const PROVIDER_LABEL: Record<string, string> = { google: "Google", kakao: "Kakao", credentials: "비상 로그인" };

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

const seoulDateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 서울 시간 「YYYY. MM. DD. HH:mm」 */
export function formatSeoulDateTime(value: Date): string {
  return seoulDateTime.format(value);
}

export const ADMIN_PAGE_SIZE = 50;

/** ?page= 값 → 1 이상 정수 (잘못된 값은 1) */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value)) return 1;
  return Math.max(1, Number(value));
}
