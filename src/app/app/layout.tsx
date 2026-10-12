import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";
import { StatusNotice } from "@/components/app-shell/status-notice";
import { decideGate } from "@/lib/auth-core/gate";
import { requireUser, viewerHasUsableName } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// 로그인 이후 화면의 틀: 비로그인은 로그인으로, 가입 대기(상한 초과·승인제 모드)·차단은 본문 대신 안내를 보여 준다.
// 레이아웃만으로는 하위 페이지를 보호하지 않는다 — 각 페이지·액션이 requireActiveUser 를 다시 부른다.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireUser();
  const gate = decideGate(viewer);
  // 이름 입력 전(이름 관문)에는 메뉴를 숨긴다 — 페이지 가드가 어차피 이름 입력 화면으로 보낸다
  const ready = gate === "ok" && (await viewerHasUsableName(viewer.id));
  return (
    <AppShell showNav={ready} isAdmin={ready && viewer.role === "admin"} displayName={viewer.name ?? viewer.email ?? "내 계정"}>
      {gate === "pending" || gate === "blocked" ? <StatusNotice kind={gate} /> : children}
    </AppShell>
  );
}
