import Script from "next/script";
import { adsEnabledFor, readAdEnv } from "@/lib/ads/config";

// AdSense 스크립트 로더. 가이드 글 상세 페이지에서만 임포트한다(전역·앱·공유 보기·로그인 레이아웃에서 임포트 금지 — 소스 계약 시험으로 고정).
// mode=serve·유효한 client·허용 경로일 때만 렌더하므로 기본(off)에서는 HTML 에 아무것도 나가지 않는다.
export function AdScript({ pathname }: { pathname: string }) {
  const env = readAdEnv();
  if (!adsEnabledFor(pathname, env)) return null;
  return (
    <Script
      id="adsbygoogle-loader"
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(env.client as string)}`}
    />
  );
}
