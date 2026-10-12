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
  experimental: { serverActions: { allowedOrigins: authHost() } },
  // 이미지 최적화 API 를 쓰지 않는다 (래스터 이미지가 없고, 해당 API 의 알려진 취약점 노출면을 없앤다).
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/s/:path*", headers: shareHeaders },
    ];
  },
};

export default nextConfig;
