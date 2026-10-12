// 로그인 시 사용자 생성·연결·갱신. 정책 판정(decideProvision)은 순수 함수이고 여기서는 그 결과를 하나의 트랜잭션에서 DB 에 반영한다.
import type { Db } from "../types.ts";
import { canLinkByEmail, decideProvision, type UserRole, type UserStatus } from "../../auth-core/provision.ts";
import { normalizeEmail } from "../../auth-core/admin-emails.ts";
import { writeAudit } from "./audit.ts";

export interface ProvisionRequest {
  provider: string;
  accountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
  adminEmailsRaw: string | undefined;
}

export type ProvisionOutcome =
  | { allowed: false; reason: "blocked" | "invalid_account" | "unsupported_provider" }
  | { allowed: true; userId: string; status: UserStatus; action: "login" | "link" | "create" };

interface UserRow {
  id: string;
  status: UserStatus;
  role: UserRole;
}

/** 호출하는 쪽이 BEGIN/COMMIT 으로 감싸서 쓴다 (withTransaction). */
export async function provisionUser(db: Db, req: ProvisionRequest): Promise<ProvisionOutcome> {
  const email = normalizeEmail(req.email);
  const linked = await db.query<UserRow>(
    `SELECT u.id::text AS id, u.status, u.role
       FROM myfp.accounts a JOIN myfp.users u ON u.id = a.user_id
      WHERE a.provider = $1 AND a.provider_account_id = $2
      FOR UPDATE OF u`,
    [req.provider, req.accountId],
  );
  let emailMatch: UserRow | undefined;
  if (!linked.rows[0] && email && canLinkByEmail(req.provider, email)) {
    const found = await db.query<UserRow>(
      "SELECT id::text AS id, status, role FROM myfp.users WHERE lower(email) = $1 FOR UPDATE",
      [email],
    );
    emailMatch = found.rows[0];
  }

  const decision = decideProvision({
    provider: req.provider,
    accountId: req.accountId,
    email,
    linked: linked.rows[0] ?? null,
    emailMatch: emailMatch ?? null,
    adminEmailsRaw: req.adminEmailsRaw,
  });
  if (decision.deny) return { allowed: false, reason: decision.reason };

  let userId: string;
  if (decision.action === "login") {
    userId = (linked.rows[0] as UserRow).id;
  } else if (decision.action === "link") {
    userId = (emailMatch as UserRow).id;
    await db.query(
      "INSERT INTO myfp.accounts (provider, provider_account_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [req.provider, req.accountId, userId],
    );
    await writeAudit(db, { actorUserId: null, action: "user.link_account", targetType: "user", targetKey: userId, after: { provider: req.provider } });
  } else {
    const created = await db.query<{ id: string }>(
      `INSERT INTO myfp.users (email, name, image, status, role, last_login_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING id::text AS id`,
      [canLinkByEmail(req.provider, email) ? email : null, req.name, req.image, decision.status, decision.ensureAdmin ? "admin" : "member"],
    );
    userId = (created.rows[0] as { id: string }).id;
    await db.query("INSERT INTO myfp.accounts (provider, provider_account_id, user_id) VALUES ($1, $2, $3)", [
      req.provider,
      req.accountId,
      userId,
    ]);
    await writeAudit(db, {
      actorUserId: null,
      action: "user.signup",
      targetType: "user",
      targetKey: userId,
      after: { provider: req.provider, status: decision.status, role: decision.ensureAdmin ? "admin" : "member" },
    });
  }

  // 이름·사진은 공급자 값이 있을 때만 갱신한다. 이메일·상태는 로그인으로 바꾸지 않는다.
  await db.query(
    `UPDATE myfp.users SET name = COALESCE($2, name), image = COALESCE($3, image), last_login_at = now() WHERE id = $1`,
    [userId, req.name, req.image],
  );
  if (decision.ensureAdmin && decision.action !== "create") {
    const promoted = await db.query("UPDATE myfp.users SET role = 'admin' WHERE id = $1 AND role <> 'admin' RETURNING id", [userId]);
    if ((promoted.rowCount ?? 0) > 0) {
      await writeAudit(db, { actorUserId: null, action: "user.role", targetType: "user", targetKey: userId, after: { role: "admin", reason: "ADMIN_EMAILS" } });
    }
  }
  return { allowed: true, userId, status: decision.status, action: decision.action };
}

/** 로그인 직후 JWT 에 넣을 DB 사용자 id 를 (공급자, 계정 id) 로 찾는다. */
export async function findUserId(db: Db, provider: string, accountId: string): Promise<string | null> {
  const res = await db.query<{ id: string }>(
    "SELECT user_id::text AS id FROM myfp.accounts WHERE provider = $1 AND provider_account_id = $2",
    [provider, accountId],
  );
  return res.rows[0]?.id ?? null;
}
