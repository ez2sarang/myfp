import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ShareViewScreen } from "@/components/share/share-view";
import { db } from "@/lib/db/pool";
import { resolveShareView } from "@/lib/share/resolve";

// 비로그인 읽기 전용 공유 보기. 쓰기 경로(서버 액션·POST 처리)가 없다.
// 무효·형식 오류·만료·폐기·소유자 비활성·조회 오류는 모두 같은 404 다(어떤 이유인지 구별할 수 없게).
// 응답 헤더(noindex·no-store·no-referrer)는 next.config.ts 의 /s/:path* 규칙이 붙인다.
export const metadata: Metadata = {
  title: "공유 보기",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const view = await resolveShareView(db, token).catch(() => null);
  if (!view) notFound();
  return <ShareViewScreen view={view} />;
}
