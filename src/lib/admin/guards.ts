// 관리 동작의 보호 규칙 (순수 모듈). 서버가 DB 상태를 읽은 뒤 이 함수로 허용 여부만 판정한다.
//  - 자기 잠금 방지: 자기 자신을 차단하거나 대기로 돌릴 수 없다.
//  - 마지막 관리자 보호: 활성 관리자가 0명이 되는 변경은 금지.
import type { UserRole, UserStatus } from "../auth-core/provision.ts";

export type GuardResult = { ok: true } | { ok: false; code: string; message: string };

export function checkStatusChange(args: {
  actorId: string;
  target: { id: string; status: UserStatus; role: UserRole };
  newStatus: UserStatus;
  activeAdminIds: readonly string[];
}): GuardResult {
  const { actorId, target, newStatus, activeAdminIds } = args;
  if (newStatus === target.status) return { ok: false, code: "no_change", message: "이미 같은 상태입니다." };
  if (actorId === target.id && newStatus !== "active") {
    return { ok: false, code: "self_lockout", message: "자기 자신을 차단하거나 대기 상태로 바꿀 수 없습니다." };
  }
  if (newStatus !== "active" && target.role === "admin" && target.status === "active") {
    const remaining = activeAdminIds.filter((id) => id !== target.id);
    if (remaining.length === 0) return { ok: false, code: "last_admin", message: "마지막 관리자는 차단하거나 대기 상태로 바꿀 수 없습니다." };
  }
  return { ok: true };
}
