import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// 콘텐츠 보안 정책: 외부 스크립트·스타일·글꼴을 쓰지 않는다. Next 의 인라인 부트스트랩 때문에 script/style 에 'unsafe-inline' 이 필요하다
// (nonce 방식은 모든 페이지를 동적으로 만들어야 해서 쓰지 않는다). 개발 모드만 React 디버깅용 'unsafe-eval' 을 허용한다.
// form-action: 로그인 서버 액션이 자바스크립트 없이 실행되면 폼 제출의 리다이렉트로 공급자 로그인 화면에 가므로 그 호스트를 허용한다.
// img-src: Google·Kakao 프로필 사진(https)을 표시한다.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://kauth.kakao.com https://accounts.kakao.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS 전용 사이트라 브라우저가 항상 HTTPS 로 접속하게 한다 (http 로 접속하는 로컬 개발에서는 브라우저가 무시한다).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

// 공유 보기(/s/<토큰>): 검색 노출 금지, 캐시 금지, 리퍼러로 토큰이 새지 않게 no-referrer. 같은 키는 뒤 규칙이 앞 규칙을 덮어쓴다.
const shareHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

// 광고(AdSense): NEXT_PUBLIC_ADSENSE_MODE=serve 이고 client 형식이 맞게 빌드한 경우에만, 가이드 글(/guide/<slug>) 하나에만 CSP 를 넓힌다.
// 기본(off)에서는 규칙을 아예 추가하지 않아 모든 경로가 위 CSP 하나를 그대로 받는다. 판정은 src/lib/ads/config.ts 와 같다(시험으로 고정).
// Google 은 광고 코드의 도메인이 수시로 바뀐다며 도메인 허용 목록을 공개하지 않고 nonce 기반 strict CSP 만 지원한다고 안내한다
// (support.google.com/adsense/answer/16283098). 정적 생성 페이지는 요청마다 nonce 를 줄 수 없어, 그 안내의 지시어 값에서 nonce 만 뺀 형태(https:)로 연다.
// 같은 키는 뒤 규칙이 앞 규칙을 덮어쓰므로 이 규칙은 전체 규칙보다 뒤에 둔다.
function adsServe(): boolean {
  const mode = (process.env.NEXT_PUBLIC_ADSENSE_MODE ?? "").trim();
  return mode === "serve" && /^ca-pub-\d{10,20}$/.test(process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "");
}

const AD_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "frame-src https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://kauth.kakao.com https://accounts.kakao.com",
  "frame-ancestors 'none'",
].join("; ");

// 서버 액션의 Origin 허용 호스트: 배포 주소(AUTH_URL)의 호스트. 프록시 뒤에서 요청 호스트가 달라도 이 호스트에서 온 액션은 받는다.
// (Origin 이 없는 요청의 거부는 src/lib/http 의 assertSameOrigin 이 맡는다. Next 자체는 Origin 이 없으면 경고만 하고 실행한다.)
function authHost(): string[] {
  try {
    const host = new URL((process.env.AUTH_URL ?? "").trim()).host;
    return host ? [host] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 광고 켜짐 여부를 빌드 상수로 고정한다. off 빌드에서는 광고 단위(클라이언트) 코드를 불러오는 분기가 죽은 코드가 되어 번들에서 빠진다(src/components/ads/ad-slot.tsx).
  env: { MYFP_ADS_SERVE_BUILD: adsServe() ? "1" : "0" },
  experimental: { serverActions: { allowedOrigins: authHost() } },
  // 이미지 최적화 API 를 쓰지 않는다 (래스터 이미지가 없고, 해당 API 의 알려진 취약점 노출면을 없앤다).
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/s/:path*", headers: shareHeaders },
      ...(adsServe() ? [{ source: "/guide/:slug", headers: [{ key: "Content-Security-Policy", value: AD_CONTENT_SECURITY_POLICY }] }] : []),
    ];
  },
};

export default nextConfig;
