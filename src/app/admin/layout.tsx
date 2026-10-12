import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// 관리자 화면 틀. 각 페이지·액션도 requireAdmin 을 다시 부른다(레이아웃만으로는 하위 페이지를 보호하지 않는다).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AppShell showNav isAdmin displayName={admin.name ?? admin.email ?? "관리자"}>
      {children}
    </AppShell>
  );
}
