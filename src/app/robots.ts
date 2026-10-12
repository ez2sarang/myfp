import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 공개 페이지만 색인을 허용한다. 로그인 이후 화면·관리자·공유 보기·API 는 크롤링하지 않게 한다
// (접근 제어는 proxy 와 각 페이지의 가드가 하고, 이 파일은 검색엔진 안내일 뿐이다).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/s/", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
