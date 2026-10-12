// 로그인 이후 화면의 접근 판정 (순수 모듈). session.ts 가 실제 리다이렉트·404 를 주입해 쓴다.
import type { UserRole, UserStatus } from "./provision.ts";

export type Gate = "login" | "pending" | "blocked" | "ok";

export function decideGate(viewer: { status: UserStatus } | null): Gate {
  if (!viewer) return "login";
  if (viewer.status === "blocked") return "blocked";
  if (viewer.status === "pending") return "pending";
  return "ok";
}

/**
 * 공유 보기 열람 판정: 로그인한 사용자 중 active·pending 은 열람 가능(링크를 받은 사람은 가입만 하면 바로 본다), blocked 는 불가.
 * /app 의 decideGate 와 별개다 — 공유 보기 때문에 pending 의 내 공간 접근이 열리지 않는다.
 */
export type ShareAccess = "login" | "blocked" | "ok";

export function decideShareAccess(viewer: { status: UserStatus } | null): ShareAccess {
  if (!viewer) return "login";
  if (viewer.status === "blocked") return "blocked";
  return "ok";
}

export function isActiveAdmin(viewer: { status: UserStatus; role: UserRole } | null): boolean {
  return viewer !== null && viewer.status === "active" && viewer.role === "admin";
}
