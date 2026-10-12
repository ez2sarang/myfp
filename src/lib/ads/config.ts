// 광고 스위치 (순수 모듈). 기본은 꺼짐이고, 꺼져 있으면 광고 관련 마크업·스크립트를 어디에도 내지 않는다.
//  - NEXT_PUBLIC_ADSENSE_MODE: "off"(기본) | "serve". 그 밖의 값·미설정은 off.
//  - NEXT_PUBLIC_ADSENSE_CLIENT: ca-pub-<숫자 10~20자리> 만 유효. 무효면 off 와 같다.
//  - NEXT_PUBLIC_ADSENSE_SLOT: 광고 단위 id(숫자 6~20자리). 없으면 슬롯을 그리지 않는다.
//  - 광고를 둘 수 있는 경로는 공개 가이드 글 상세(/guide/<slug>) 하나뿐이다. 목록·소개·로그인·앱·공유 보기·관리자·정책·API 는 모두 거부.

export type AdMode = "off" | "serve";

export function parseAdMode(raw: string | undefined): AdMode {
  return (raw ?? "").trim() === "serve" ? "serve" : "off";
}

export function isValidAdClient(raw: string | undefined): raw is string {
  return typeof raw === "string" && /^ca-pub-\d{10,20}$/.test(raw);
}

export function isValidAdSlot(raw: string | undefined): raw is string {
  return typeof raw === "string" && /^\d{6,20}$/.test(raw);
}

const GUIDE_ARTICLE_RE = /^\/guide\/[a-z0-9-]+\/?$/;

/** 광고 허용 경로: /guide/<slug> 만 (목록 /guide 는 제외). 대소문자·인코딩 우회는 형식 검사에서 거부된다. */
export function isAdPath(pathname: string): boolean {
  return typeof pathname === "string" && GUIDE_ARTICLE_RE.test(pathname);
}

/**
 * 광고 라벨. 공식 정책은 "Advertisements"·"Sponsored Links" 표기를 허용한다고 안내한다.
 * 한국어 공식 라벨 문구는 미확인이다 — serve 로 바꾸기 전에 AdSense 정책 도움말에서 확인할 것.
 */
export const AD_LABEL = "Advertisements";

/** 글 한 편에 넣을 수 있는 최대 광고 수 */
export const MAX_ADS_PER_ARTICLE = 2;

/** 광고 슬롯 높이(px): 늦게 채워져도 화면이 밀리지 않게 자리를 미리 잡는다(CLS 방지). */
export const AD_SLOT_MIN_HEIGHT = 280;

export interface AdEnv {
  mode: string | undefined;
  client: string | undefined;
  slot: string | undefined;
}

export const readAdEnv = (): AdEnv => ({
  mode: process.env.NEXT_PUBLIC_ADSENSE_MODE,
  client: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
  slot: process.env.NEXT_PUBLIC_ADSENSE_SLOT,
});

/** 광고를 실제로 내보낼지: serve + 유효한 client + 허용 경로 */
export function adsEnabledFor(pathname: string, env: AdEnv): boolean {
  return parseAdMode(env.mode) === "serve" && isValidAdClient(env.client) && isAdPath(pathname);
}
