// 세션 쿠키 이름·옵션 (순수 모듈). proxy 의 토큰 확인과 Auth.js 설정이 같은 값을 쓰도록 한 곳에 둔다.
//
// 운영(NODE_ENV=production) 이거나 AUTH_URL 이 https 이면 __Host- 쿠키: Secure, Path=/, Domain 없음(호스트 한정), HttpOnly, SameSite=Lax.
// http 로컬 개발(next dev)만 접두사 없는 이름을 쓴다. AUTH_URL 이 없거나 잘못돼도 예외 없이 "https 아님"으로 본다.

function isHttps(url: string | undefined): boolean {
  try {
    return new URL((url ?? "").trim()).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieFor(authUrl: string | undefined, nodeEnv: string | undefined) {
  const secure = nodeEnv === "production" || isHttps(authUrl);
  return {
    name: secure ? "__Host-authjs.session-token" : "authjs.session-token",
    options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure },
  };
}

export const SESSION_COOKIE = sessionCookieFor(process.env.AUTH_URL, process.env.NODE_ENV);
