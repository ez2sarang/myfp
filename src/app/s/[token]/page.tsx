import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StatusNotice } from "@/components/app-shell/status-notice";
import { ShareViewScreen } from "@/components/share/share-view";
import { db } from "@/lib/db/pool";
import { requireShareViewer } from "@/lib/session";
import { resolveShareView } from "@/lib/share/resolve";

// 읽기 전용 공유 보기. 쓰기 경로(서버 액션·POST 처리)가 없다.
// 열람은 로그인한 사용자(active·pending)만: 비로그인은 proxy 와 이 페이지가 토큰을 보기 전에 로그인으로 보낸다(로그인 뒤 같은 주소로 복귀).
// blocked 는 데이터 없이 안내만. 로그인 사용자의 무효·형식 오류·만료·폐기·소유자 비활성·조회 오류는 모두 같은 404 다.
// 응답 헤더(noindex·no-store·no-referrer)는 next.config.ts 의 /s/:path* 규칙이 붙인다.
export const metadata: Metadata = {
  title: "공유 보기",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { token } = await params;
  // 열람자 판정을 토큰 조회보다 먼저 한다: 비로그인·차단 사용자에게는 토큰이 유효한지 드러나지 않는다.
  const { viewer, blocked } = await requireShareViewer(`/s/${token}`);
  if (blocked) {
    return (
      <main id="main" className="wrap py-12">
        <StatusNotice kind="blocked" />
      </main>
    );
  }
  // 세부 목록의 정렬·필터 쿼리. 값은 buildShareView 가 허용 목록으로 다시 검증한다.
  const view = await resolveShareView(db, token, new Date(), await searchParams, viewer.id).catch(() => null);
  if (!view) notFound();
  return <ShareViewScreen view={view} basePath={`/s/${token}`} pendingViewer={viewer.status === "pending"} />;
}
