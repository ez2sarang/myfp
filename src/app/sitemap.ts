import type { MetadataRoute } from "next";
import { guideSitemapEntries } from "@/lib/guide/content";
import { SITE_URL } from "@/lib/site";

// 공개 페이지만 싣는다 (소개·가이드 목록과 글·개인정보 처리방침·이용약관). 가이드 글의 lastModified 는 프론트매터 updated.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...guideSitemapEntries(SITE_URL),
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
