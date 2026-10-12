// 감사 기록 (추가 전용). 앱 역할에는 audit_log 의 UPDATE·DELETE 권한이 없다. 금액·이메일 같은 값은 넣지 않고 무엇이 바뀌었는지만 남긴다.
import type { Db } from "../types.ts";

export const AUDIT_ACTIONS = [
  "user.signup",
  "user.link_account",
  "user.status",
  "user.role",
  "data.delete_all",
  "user.delete_self",
  "share.create",
  "share.revoke",
  "household.create",
  "household.invite",
  "household.join",
  "household.leave",
  "household.remove",
  "household.delete",
  "import.photo",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  targetType: "user" | "share_link" | "household";
  targetKey: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO myfp.audit_log (actor_user_id, action, target_type, target_key, before, after)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      entry.actorUserId,
      entry.action,
      entry.targetType,
      entry.targetKey,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}
