// 사용자 조회·관리 (서버 전용, Db 주입). 관리 변경은 보호 규칙(admin/guards.ts)을 통과한 뒤에만 쓰고 감사 기록을 남긴다.
import { checkStatusChange, type GuardResult } from "../../admin/guards.ts";
import type { UserRole, UserStatus } from "../../auth-core/provision.ts";
import { isUuid, type Db } from "../types.ts";
import { writeAudit } from "./audit.ts";

export interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  status: UserStatus;
  role: UserRole;
}

export async function getUserRecord(db: Db, userId: string): Promise<UserRecord | null> {
  if (!isUuid(userId)) return null;
  const res = await db.query<UserRecord>("SELECT id::text AS id, email, name, image, status, role FROM myfp.users WHERE id = $1", [userId]);
  return res.rows[0] ?? null;
}

export interface AdminUserRow extends UserRecord {
  createdAt: Date;
  lastLoginAt: Date | null;
  providers: string[];
}

export async function listUsers(db: Db): Promise<AdminUserRow[]> {
  const res = await db.query<{
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    status: UserStatus;
    role: UserRole;
    created_at: Date;
    last_login_at: Date | null;
    providers: string[] | null;
  }>(
    `SELECT u.id::text AS id, u.email, u.name, u.image, u.status, u.role, u.created_at, u.last_login_at,
            array_remove(array_agg(DISTINCT a.provider), NULL) AS providers
       FROM myfp.users u LEFT JOIN myfp.accounts a ON a.user_id = u.id
      GROUP BY u.id
      ORDER BY (u.status = 'pending') DESC, u.created_at DESC
      LIMIT 500`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    image: r.image,
    status: r.status,
    role: r.role,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    providers: r.providers ?? [],
  }));
}

/** 상태별 사용자 수 (관리자 화면 요약) */
export async function countUsersByStatus(db: Db): Promise<Record<UserStatus, number>> {
  const res = await db.query<{ status: UserStatus; n: string }>("SELECT status, count(*)::text AS n FROM myfp.users GROUP BY status");
  const out: Record<UserStatus, number> = { active: 0, pending: 0, blocked: 0 };
  for (const r of res.rows) if (r.status in out) out[r.status] = Number(r.n);
  return out;
}

/** 사용자 상태 변경 (가입 대기 처리·차단·차단 해제). 호출하는 쪽이 트랜잭션으로 감싼다. */
export async function setUserStatus(db: Db, actorId: string, targetId: string, newStatus: string): Promise<GuardResult> {
  if (!isUuid(targetId)) return { ok: false, code: "not_found", message: "사용자를 찾을 수 없습니다." };
  if (newStatus !== "active" && newStatus !== "blocked" && newStatus !== "pending") {
    return { ok: false, code: "invalid", message: "알 수 없는 상태입니다." };
  }
  // 활성 관리자 목록을 잠가 동시 변경으로 마지막 관리자가 사라지는 경쟁을 막는다.
  const admins = await db.query<{ id: string }>("SELECT id::text AS id FROM myfp.users WHERE role = 'admin' AND status = 'active' FOR UPDATE");
  const target = await db.query<{ id: string; status: UserStatus; role: UserRole }>(
    "SELECT id::text AS id, status, role FROM myfp.users WHERE id = $1 FOR UPDATE",
    [targetId],
  );
  const row = target.rows[0];
  if (!row) return { ok: false, code: "not_found", message: "사용자를 찾을 수 없습니다." };
  const verdict = checkStatusChange({
    actorId,
    target: row,
    newStatus,
    activeAdminIds: admins.rows.map((a) => a.id),
  });
  if (!verdict.ok) return verdict;
  await db.query("UPDATE myfp.users SET status = $2 WHERE id = $1", [targetId, newStatus]);
  await writeAudit(db, {
    actorUserId: actorId,
    action: "user.status",
    targetType: "user",
    targetKey: targetId,
    before: { status: row.status },
    after: { status: newStatus },
  });
  return { ok: true };
}
