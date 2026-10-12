// 같은 사이트에서 온 변경 요청인지 판정하는 순수 모듈 (서버 액션과 쓰기 라우트의 CSRF 보강).
// Next 의 서버 액션 Origin 검사는 Origin 헤더가 없으면 경고만 하고 실행한다. 여기서는 Origin 을 필수로 하고,
// 그 호스트가 요청 호스트(host, x-forwarded-host 첫 값) 또는 AUTH_URL 의 호스트와 같을 때만 허용한다.
// 브라우저는 교차 사이트 POST 와 대부분의 same-origin POST 에 Origin 을 붙이므로 정상 사용에는 영향이 없다.

interface HeaderReader {
  get(name: string): string | null;
}

function hostOf(value: string | null | undefined): string | null {
  const text = (value ?? "").trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function authUrlHost(authUrl: string | undefined): string | null {
  try {
    return new URL((authUrl ?? "").trim()).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Origin 헤더 값(직렬화된 origin)에서 호스트(포트 포함)를 꺼낸다. 형식이 이상하거나 http(s) 가 아니면 null. */
function originHost(origin: string | null | undefined): string | null {
  const raw = (origin ?? "").trim().toLowerCase();
  if (raw.length === 0 || raw === "null") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // 경로·쿼리·사용자 정보가 붙은 값은 올바른 Origin 이 아니다 (https://host@evil.example 같은 속임수 차단)
    if (url.origin !== raw) return null;
    return url.host;
  } catch {
    return null;
  }
}

export interface OriginInput {
  origin: string | null | undefined;
  host: string | null | undefined;
  forwardedHost: string | null | undefined;
  authUrl: string | undefined;
}

export function isSameOrigin(input: OriginInput): boolean {
  const fromOrigin = originHost(input.origin);
  if (fromOrigin === null) return false;
  const allowed = [hostOf(input.host), hostOf(input.forwardedHost?.split(",")[0]), authUrlHost(input.authUrl)];
  return allowed.some((host) => host !== null && host === fromOrigin);
}

export function isSameOriginHeaders(headers: HeaderReader, authUrl: string | undefined): boolean {
  return isSameOrigin({
    origin: headers.get("origin"),
    host: headers.get("host"),
    forwardedHost: headers.get("x-forwarded-host"),
    authUrl,
  });
}

/** 같은 사이트의 요청이 아니면 deny() 를 부른다 (deny 는 던져야 한다). 서버 액션 가드의 판정 부분이라 프레임워크 없이 시험한다. */
export function enforceSameOrigin(headers: HeaderReader, authUrl: string | undefined, deny: () => never): void {
  if (!isSameOriginHeaders(headers, authUrl)) deny();
}
