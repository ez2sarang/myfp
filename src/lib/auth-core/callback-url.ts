// 로그인 뒤 돌아갈 주소(callbackUrl) 정규화 (순수 모듈). 같은 사이트의 상대 경로만 허용해 open redirect 를 막는다.

const MAX_LENGTH = 512;
// 파서가 조용히 제거하는 탭·줄바꿈까지 포함한 제어 문자
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// 되돌아가면 로그인 루프가 되거나 인증 엔드포인트인 경로
const BLOCKED_PREFIXES = ["/login", "/api/auth"];
const PROBE_ORIGIN = "http://probe.invalid";

function suspicious(path: string): boolean {
  return path.includes("\\") || CONTROL.test(path) || path.startsWith("//");
}

export function safeCallbackPath(raw: unknown, fallback = "/app"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith("/") || suspicious(value)) return fallback;

  // 퍼센트 인코딩을 최대 3번 풀어 보며 우회 형태(%2f%2f, %5c, %0d%0a)를 막는다. 풀리지 않는 입력은 거부한다.
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    if (!current.includes("%")) break;
    try {
      current = decodeURIComponent(current);
    } catch {
      return fallback;
    }
    if (suspicious(current)) return fallback;
  }

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  const target = url.pathname + url.search + url.hash;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;

  const lowered = url.pathname.toLowerCase();
  for (const blocked of BLOCKED_PREFIXES) {
    if (lowered === blocked || lowered.startsWith(`${blocked}/`)) return fallback;
  }
  return target;
}

/** /login 주소를 만든다. 돌아갈 경로가 없거나 안전하지 않으면 callbackUrl 을 붙이지 않는다. */
export function buildLoginUrl(callbackPath?: string): string {
  if (!callbackPath) return "/login";
  const safe = safeCallbackPath(callbackPath, "");
  return safe ? `/login?callbackUrl=${encodeURIComponent(safe)}` : "/login";
}

/** 로그인 실패 뒤 다시 보여 줄 /login 주소: 오류 코드와 (안전한) 돌아갈 경로를 함께 유지해, 재시도에 성공하면 원래 경로로 간다. */
export function buildLoginErrorUrl(error: string, callbackPath?: string): string {
  const params = new URLSearchParams({ error });
  const safe = callbackPath ? safeCallbackPath(callbackPath, "") : "";
  if (safe) params.set("callbackUrl", safe);
  return `/login?${params.toString()}`;
}

/** Auth.js redirect 콜백용: 절대 주소는 같은 origin 일 때만 경로로 바꾸고, 그 외는 기본 경로로 보낸다. */
export function safeRedirectTarget(url: string, baseUrl: string, fallback = "/app"): string {
  if (url.startsWith("/")) return safeCallbackPath(url, fallback);
  try {
    const parsed = new URL(url);
    if (parsed.origin === new URL(baseUrl).origin) {
      return safeCallbackPath(parsed.pathname + parsed.search + parsed.hash, fallback);
    }
  } catch {
    // 아래 fallback
  }
  return fallback;
}
