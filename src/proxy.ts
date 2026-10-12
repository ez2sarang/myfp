// 거친 관문: 공개 허용 목록 밖의 모든 경로(API 포함)는 세션 쿠키가 없으면 로그인으로 보낸다 (API 는 401 JSON).
// 이 파일은 세션 쿠키의 유효성만 본다. 계정 상태·관리자 여부는 서버(src/lib/session.ts 의 requireActiveUser·requireAdmin)가 다시 판정한다.
// 서버 액션은 POST 로 해당 페이지 경로에 들어오므로 proxy 매처에 의존하지 않고 각 액션이 assertSameOrigin·requireActiveUser 를 직접 호출한다.
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-core/cookie";
import { decideProxy } from "@/lib/auth-core/proxy-decision";

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false; // 비밀이 없으면 열어 두지 않고 닫는다
  try {
    // Authorization 헤더는 보지 않고 세션 쿠키만 확인한다
    const cookie = request.headers.get("cookie");
    const token = await getToken({
      req: { headers: new Headers(cookie ? { cookie } : {}) },
      secret,
      cookieName: SESSION_COOKIE.name,
      secureCookie: SESSION_COOKIE.options.secure,
    });
    return typeof token?.uid === "string";
  } catch {
    return false;
  }
}

// proxy 가 직접 만드는 응답(401·로그인 이동)은 캐시하지 않는다. next.config 의 경로별 헤더 규칙은 응답 상태를 가리지 않아서
// (예: /ocr/* 의 1년 불변 캐시) 이 값이 없으면 로그인 이동 응답이 그 경로의 캐시 헤더를 받아 브라우저에 오래 남을 수 있다.
const NO_STORE = { "Cache-Control": "no-store" };

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const decision = await decideProxy(pathname, search, () => hasValidSession(request));
  if (decision.action === "next") return NextResponse.next();
  if (decision.action === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  if (decision.callback) login.searchParams.set("callbackUrl", decision.callback);
  const response = NextResponse.redirect(login, 303);
  response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return response;
}

// 모든 경로에서 실행하고 공개 여부는 classifyPath 가 정한다 (부정형 전방탐색 매처를 쓰지 않는다).
export const config = { matcher: "/:path*" };
