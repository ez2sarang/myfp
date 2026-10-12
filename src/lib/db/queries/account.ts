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
