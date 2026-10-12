// 내 데이터 전체 삭제 (서버 전용, Db 주입). 사용자 계정(로그인)은 남기고 사용자가 입력한 재무 데이터·순자산 스냅샷·공유 링크를 지운다.
// 호출하는 쪽이 트랜잭션으로 감싼다. 감사 기록에는 지운 건수만 남긴다.
import type { Db } from "../types.ts";
import { writeAudit } from "./audit.ts";

export async function deleteAllUserData(db: Db, userId: string): Promise<{ fixed: number; balances: number; shares: number }> {
  const fixed = await db.query("DELETE FROM myfp.fixed_expenses WHERE user_id = $1", [userId]);
  const balances = await db.query("DELETE FROM myfp.balance_items WHERE user_id = $1", [userId]);
  const shares = await db.query("DELETE FROM myfp.share_links WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM myfp.balance_snapshots WHERE user_id = $1", [userId]);
  const counts = { fixed: fixed.rowCount ?? 0, balances: balances.rowCount ?? 0, shares: shares.rowCount ?? 0 };
  await writeAudit(db, { actorUserId: userId, action: "data.delete_all", targetType: "user", targetKey: userId, after: counts });
  return counts;
}

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "not_found" | "last_admin" };

/**
 * 계정 자기 삭제: 재무 데이터·스냅샷·공유 링크·로그인 연결(accounts)·사용자 행을 지운다. 호출하는 쪽이 트랜잭션으로 감싼다.
 * 마지막 활성 관리자는 지울 수 없다. 감사 기록에는 사용자 id(문자열)와 지운 건수만 남는다(이름·이메일·금액 없음).
 * 모든 쿼리는 세션 사용자 id 하나로만 범위가 묶인다.
 */
export async function deleteAccount(db: Db, userId: string): Promise<DeleteAccountResult> {
  // 관리자 목록을 잠가 동시에 두 관리자가 스스로를 지워 0명이 되는 경쟁을 막는다.
  const admins = await db.query<{ id: string }>("SELECT id::text AS id FROM myfp.users WHERE role = 'admin' AND status = 'active' FOR UPDATE");
  const me = await db.query<{ role: string; status: string }>("SELECT role, status FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const row = me.rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.role === "admin" && row.status === "active" && admins.rows.every((a) => a.id === userId)) return { ok: false, reason: "last_admin" };
  const counts = await deleteAllUserData(db, userId);
  await db.query("DELETE FROM myfp.accounts WHERE user_id = $1", [userId]);
  await writeAudit(db, { actorUserId: null, action: "user.delete_self", targetType: "user", targetKey: userId, after: counts });
  await db.query("DELETE FROM myfp.users WHERE id = $1", [userId]);
  return { ok: true };
}
