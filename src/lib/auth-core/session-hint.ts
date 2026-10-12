// /api/auth/session 응답에서 로그인 여부만 읽는다 (순수 모듈). 응답은 {expires, user:{id}} 이거나, 로그인하지 않았으면 null 또는 빈 객체다.
// 소개 페이지의 링크 문구를 바꾸는 데만 쓴다 — 접근 제어가 아니다(실제 판정은 각 페이지의 서버 가드가 한다).
export function isSignedInSession(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const user = (data as { user?: unknown }).user;
  if (typeof user !== "object" || user === null) return false;
  const id = (user as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0;
}
