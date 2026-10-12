import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "승인 대기" };

// 승인 대기·차단 계정은 레이아웃이 이 경로에서 본문 대신 안내를 보여 준다.
// 이 본문에 도달했다면 활성 계정이므로 대시보드로 보낸다.
export default async function PendingPage() {
  const viewer = await requireUser("/app");
  if (viewer.status === "active") redirect("/app");
  return null;
}
