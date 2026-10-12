import { handlers } from "@/lib/auth";
import { isSameOriginHeaders } from "@/lib/http/origin";

export const GET = handlers.GET;

// 변경 요청(POST)은 Origin 이 같은 사이트일 때만 Auth.js 핸들러로 넘긴다 (Auth.js 자체의 CSRF 토큰 검사에 더하는 2중 방어).
export async function POST(request: Request) {
  if (!isSameOriginHeaders(request.headers, process.env.AUTH_URL)) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return handlers.POST(request as Parameters<typeof handlers.POST>[0]);
}
