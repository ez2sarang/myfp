import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 공개 페이지만 싣는다 (소개·개인정보 처리방침·이용약관).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
