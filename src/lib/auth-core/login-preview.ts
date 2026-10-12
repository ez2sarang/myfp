// 로그인 화면의 링크 미리보기 메타데이터 (순수 모듈).
// 비로그인으로 초대 링크(/join/<토큰>)·공유 링크(/s/<토큰>)를 열면 proxy 가 토큰과 상관없이 똑같이 /login?callbackUrl=… 로 보낸다(존재 오라클 없음).
// 카카오톡 같은 미리보기 크롤러는 그 로그인 화면의 메타데이터를 읽으므로, 여기서 callbackUrl 의 "종류"(공유 / 초대 / 그 밖)만 보고 일반 문구를 고른다.
// 토큰·callbackUrl 값은 어떤 메타 필드(og:url·canonical 포함)에도 넣지 않고, 주인 이름·항목·금액 같은 데이터도 넣지 않는다.
// 문구는 개인정보 처리방침 3절(공유)·9절(함께 보기)과 같은 동작만 말한다.
import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../site.ts";
import { safeCallbackPath } from "./callback-url.ts";

export type PreviewKind = "share" | "invite" | "login";

/** callbackUrl → 미리보기 종류. 안전한 같은 사이트 경로로 정규화한 뒤 접두사만 본다(그 밖·의심스러운 값은 기본 로그인) */
export function previewKind(raw: unknown): PreviewKind {
  const path = safeCallbackPath(raw, "");
  if (path.startsWith("/s/")) return "share";
  if (path.startsWith("/join/")) return "invite";
  return "login";
}

/** 링크 미리보기 이미지 규약: public/og/<이름>.png, 1200×630, 200KB 이하. 파일이 있을 때만 쓴다(빌드 때 next.config 가 확인) */
export const OG_IMAGE = { width: 1200, height: 630, maxBytes: 200 * 1024 } as const;
export const OG_IMAGE_NAMES = ["share", "invite"] as const;
export type OgImageName = (typeof OG_IMAGE_NAMES)[number];

export const PREVIEW_TEXT: Record<PreviewKind, { title: string; description: string; image: OgImageName | null; alt: string }> = {
  share: {
    title: `${SITE_NAME} 공유 링크 · 로그인하면 열려요`,
    description: "읽기 전용으로 공유된 재무 요약이에요. Google·카카오로 로그인(가입)하면 바로 볼 수 있어요.",
    image: "share",
    alt: `${SITE_NAME} 공유 링크`,
  },
  invite: {
    title: `${SITE_NAME} 함께 보기 초대`,
    description: "로그인 후 동의 문구를 확인하고 직접 수락하면 함께 보기에 들어가요. 보여 줄 범위는 각자 고릅니다.",
    image: "invite",
    alt: `${SITE_NAME} 함께 보기 초대`,
  },
  login: {
    title: `로그인 | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    image: null,
    alt: SITE_NAME,
  },
};

/** 빌드 때 확인한 미리보기 이미지 목록(next.config 의 MYFP_OG_IMAGES, 쉼표 구분) */
export function availableOgImages(value: string | undefined = process.env.MYFP_OG_IMAGES): Set<OgImageName> {
  const names = (value ?? "").split(",").map((s) => s.trim());
  return new Set(OG_IMAGE_NAMES.filter((n) => names.includes(n)));
}

export function loginMetadata(kind: PreviewKind, images: ReadonlySet<OgImageName> = availableOgImages()): Metadata {
  const text = PREVIEW_TEXT[kind];
  const image = text.image && images.has(text.image) ? { url: `${SITE_URL}/og/${text.image}.png`, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: text.alt } : null;
  return {
    title: { absolute: text.title },
    description: text.description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE_NAME,
      title: text.title,
      description: text.description,
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: text.title,
      description: text.description,
      ...(image ? { images: [image.url] } : {}),
    },
  };
}
