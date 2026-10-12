// 사용자에게 보여 줄 절대 주소의 기준(공유 링크·초대 링크): AUTH_URL(배포 주소). 없으면 같은 사이트 요청의 Origin(assertSameOrigin 을 통과한 값).
import { headers } from "next/headers";

export async function siteBase(): Promise<string> {
  try {
    const url = new URL((process.env.AUTH_URL ?? "").trim());
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // 아래로
  }
  return (await headers()).get("origin") ?? "";
}
