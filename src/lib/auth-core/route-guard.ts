// proxy 의 경로 분류 (순수 모듈). 공개 허용 목록 방식: 아래에 정확히 일치하는 경로만 공개이고 그 외는 모두 보호한다.
//
// 우회 방어:
//  - 정규식 접두사 부정형 전방탐색(matcher) 대신 디코딩한 경로를 문자열로 비교한다.
//  - 퍼센트 인코딩은 최대 3번 풀어서 비교한다 (%2e%2e, %2f, 이중 인코딩). 풀리지 않거나 3번 뒤에도 % 가 남으면 비공개.
//  - 역슬래시, 제어 문자, 연속 슬래시(//), 점 구간(. 또는 ..)이 어느 단계에서든 보이면 비공개.
//  - 대소문자는 구분한다 (/Login 은 공개가 아니다 — Next 라우터도 구분한다). 접두사는 경계(/)까지 일치해야 한다.
// proxy 는 거친 관문일 뿐이다. 계정 상태·관리자 권한은 서버(requireActiveUser/requireAdmin)가 다시 강제한다.

export type PathClass = "public" | "protected-page" | "protected-api";

const PUBLIC_EXACT: ReadonlySet<string> = new Set([
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/guide",
  "/api/health",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/icon.svg",
]);

// 접두사 + "/" 경계까지 일치해야 공개
// 공유 보기 /s/<토큰> 은 공개가 아니다: 세션이 없으면 토큰 유효 여부와 상관없이 똑같이 로그인으로 보낸다(존재 오라클 없음).
// /og/: 링크 미리보기 이미지(비밀 없는 정적 파일) — 비로그인 미리보기 크롤러가 받아야 한다
const PUBLIC_PREFIXES: readonly string[] = ["/api/auth", "/_next", "/brand", "/og"];

// 공개 가이드 글: /guide/<slug> 한 단계만 (slug 는 소문자·숫자·하이픈). 더 깊은 경로·대문자는 공개가 아니다.
const PUBLIC_GUIDE_ARTICLE = /^\/guide\/[a-z0-9-]+$/;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_LENGTH = 2048;

function badForm(path: string): boolean {
  if (path.includes("\\") || CONTROL.test(path) || path.includes("//")) return true;
  return path.split("/").some((seg) => seg === "." || seg === "..");
}

/** 비교용으로 정규화한 경로. 의심스러우면 null. */
export function normalizeForMatch(pathname: string): string | null {
  if (typeof pathname !== "string" || pathname.length === 0 || pathname.length > MAX_LENGTH) return null;
  if (!pathname.startsWith("/")) return null;
  let current = pathname;
  if (badForm(current)) return null;
  for (let i = 0; i < 3 && current.includes("%"); i += 1) {
    try {
      current = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (badForm(current)) return null;
  }
  if (current.includes("%")) return null;
  if (current.length > 1 && current.endsWith("/")) current = current.slice(0, -1);
  return current;
}

// 응답 형식(401 JSON 대 로그인 이동)만 정하므로 대소문자를 무시한다. 공개 여부 판정은 대소문자를 구분한다.
function isApiPath(path: string): boolean {
  const lowered = path.toLowerCase();
  return lowered === "/api" || lowered.startsWith("/api/");
}

export function classifyPath(pathname: string): PathClass {
  const normalized = normalizeForMatch(pathname);
  if (normalized !== null) {
    if (PUBLIC_EXACT.has(normalized) || PUBLIC_GUIDE_ARTICLE.test(normalized)) return "public";
    for (const prefix of PUBLIC_PREFIXES) {
      if (normalized.startsWith(`${prefix}/`)) return "public";
    }
    return isApiPath(normalized) ? "protected-api" : "protected-page";
  }
  // 의심스러운 경로: 공개가 아니다. API 응답 형식만 원문 접두사로 고른다.
  const lowered = typeof pathname === "string" ? pathname.toLowerCase() : "";
  return isApiPath(lowered) || lowered.startsWith("/api%") ? "protected-api" : "protected-page";
}
