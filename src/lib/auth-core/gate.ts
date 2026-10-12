// 로그인 이후 화면의 접근 판정 (순수 모듈). session.ts 가 실제 리다이렉트·404 를 주입해 쓴다.
import type { UserRole, UserStatus } from "./provision.ts";

export type Gate = "login" | "pending" | "blocked" | "ok";

export function decideGate(viewer: { status: UserStatus } | null): Gate {
  if (!viewer) return "login";
  if (viewer.status === "blocked") return "blocked";
  if (viewer.status === "pending") return "pending";
  return "ok";
}

export function isActiveAdmin(viewer: { status: UserStatus; role: UserRole } | null): boolean {
  return viewer !== null && viewer.status === "active" && viewer.role === "admin";
}
