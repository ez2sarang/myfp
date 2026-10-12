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

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  displayName: string | null;
  status: UserStatus;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date | null;
  providers: string[];
  /** 등록 항목 수만 (금액·이름·메모는 조회하지 않는다) */
  counts: { fixed: number; balances: number; activeShares: number };
}

/**
 * 관리자 사용자 목록: 가입일 내림차순, 페이지 단위. 로그인 수단과 등록 항목 수를 상관 하위 쿼리로 한 번에 센다(사용자마다 따로 묻지 않는다).
 * 재무 테이블에서는 count(*) 와 소유자·폐기·만료 조건만 쓰고 금액·이름·메모 열은 읽지 않는다(소스 계약 시험으로 고정).
 * display_name 은 0005 적용 전에도 깨지지 않게 to_jsonb 로 읽는다(열이 없으면 null).
 */
export async function listUsers(db: Db, page: { limit: number; offset: number }): Promise<AdminUserRow[]> {
  const limit = Math.min(Math.max(Math.trunc(page.limit), 1), 200);
  const offset = Math.max(Math.trunc(page.offset), 0);
  const res = await db.query<{
    id: string;
    email: string | null;
    name: string | null;
    display_name: string | null;
    status: UserStatus;
    role: UserRole;
    created_at: Date;
    last_login_at: Date | null;
    providers: string[] | null;
    fixed_count: number;
    balance_count: number;
    share_count: number;
  }>(
    `SELECT u.id::text AS id, u.email, u.name, to_jsonb(u) ->> 'display_name' AS display_name, u.status, u.role, u.created_at, u.last_login_at,
            (SELECT array_agg(DISTINCT a.provider) FROM myfp.accounts a WHERE a.user_id = u.id) AS providers,
            (SELECT count(*) FROM myfp.fixed_expenses f WHERE f.user_id = u.id)::int AS fixed_count,
            (SELECT count(*) FROM myfp.balance_items b WHERE b.user_id = u.id)::int AS balance_count,
            (SELECT count(*) FROM myfp.share_links s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now()))::int AS share_count
       FROM myfp.users u
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    displayName: r.display_name,
    status: r.status,
    role: r.role,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    providers: r.providers ?? [],
    counts: { fixed: Number(r.fixed_count), balances: Number(r.balance_count), activeShares: Number(r.share_count) },
  }));
}

/** 본인 표시 이름 (설정 화면·대시보드 안내용). 0005 적용 전이면 null. */
export async function getDisplayName(db: Db, userId: string): Promise<string | null> {
  if (!isUuid(userId)) return null;
  const res = await db.query<{ display_name: string | null }>("SELECT to_jsonb(u) ->> 'display_name' AS display_name FROM myfp.users u WHERE u.id = $1", [userId]);
  return res.rows[0]?.display_name ?? null;
}

/** 본인 표시 이름 저장·지우기(null). userId 는 항상 세션 사용자 id 다(호출하는 서버 액션이 보장). 바뀐 행이 없으면 false. */
export async function setDisplayName(db: Db, userId: string, value: string | null): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const res = await db.query("UPDATE myfp.users SET display_name = $2 WHERE id = $1", [userId, value]);
  return (res.rowCount ?? 0) === 1;
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
