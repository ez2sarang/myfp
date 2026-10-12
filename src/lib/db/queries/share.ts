// 공유 링크 저장소 (서버 전용, Db 주입). 관리(목록·생성·폐기)는 WHERE user_id = <세션 사용자> 로 묶는다.
// 공유 보기 조회는 토큰 해시로만 찾는다(사용자 id 를 입력으로 받지 않는다).
import { LIMITS } from "../../finance/types.ts";
import { normalizeMasks, normalizeScopes, type ShareInput, type ShareMasks, type ShareScope } from "../../share/options.ts";
import { isUuid, type Db } from "../types.ts";
import { writeAudit } from "./audit.ts";

export interface ShareLinkRow {
  id: string;
  label: string;
  scopes: ShareScope[];
  masks: ShareMasks;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
}

interface RawShare {
  id: string;
  label: string;
  scopes: unknown;
  masks: unknown;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  view_count: number;
  last_viewed_at: Date | null;
}

const SHARE_COLUMNS = "id::text AS id, label, scopes, masks, created_at, expires_at, revoked_at, view_count, last_viewed_at";

function fromRaw(r: RawShare): ShareLinkRow {
  return {
    id: r.id,
    label: r.label,
    scopes: normalizeScopes(r.scopes),
    masks: normalizeMasks(r.masks),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    viewCount: Number(r.view_count),
    lastViewedAt: r.last_viewed_at,
  };
}

export async function listShareLinks(db: Db, userId: string): Promise<ShareLinkRow[]> {
  const res = await db.query<RawShare>(
    `SELECT ${SHARE_COLUMNS} FROM myfp.share_links WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [userId],
  );
  return res.rows.map(fromRaw);
}

export type CreateShareResult = { ok: true; id: string } | { ok: false; reason: "limit" };

/** 활성 링크(폐기·만료되지 않은 것)가 상한(10개) 미만일 때만 만든다. 호출하는 쪽이 트랜잭션으로 감싼다. */
export async function createShareLink(db: Db, userId: string, input: ShareInput, tokenHash: string): Promise<CreateShareResult> {
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const active = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM myfp.share_links
      WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
  );
  if (Number(active.rows[0]?.n ?? 0) >= LIMITS.activeShareLinks) return { ok: false, reason: "limit" };
  const res = await db.query<{ id: string }>(
    `INSERT INTO myfp.share_links (user_id, label, token_hash, scopes, masks, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) RETURNING id::text AS id`,
    [userId, input.label, tokenHash, JSON.stringify(input.scopes), JSON.stringify(input.masks), input.expiresAt],
  );
  const id = (res.rows[0] as { id: string }).id;
  await writeAudit(db, { actorUserId: userId, action: "share.create", targetType: "share_link", targetKey: id, after: { scopes: input.scopes, masks: input.masks } });
  return { ok: true, id };
}

export async function revokeShareLink(db: Db, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db.query(
    "UPDATE myfp.share_links SET revoked_at = now() WHERE user_id = $1 AND id = $2 AND revoked_at IS NULL",
    [userId, id],
  );
  const changed = (res.rowCount ?? 0) > 0;
  if (changed) await writeAudit(db, { actorUserId: userId, action: "share.revoke", targetType: "share_link", targetKey: id });
  return changed;
}

export interface ShareLookup {
  id: string;
  ownerId: string;
  ownerStatus: string;
  scopes: ShareScope[];
  masks: ShareMasks;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** 토큰 해시로 공유 링크를 찾는다. 상태 판정(만료·폐기·소유자 상태)은 호출하는 쪽이 한다. */
export async function findShareByTokenHash(db: Db, tokenHash: string): Promise<ShareLookup | null> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return null;
  const res = await db.query<RawShare & { owner_id: string; owner_status: string }>(
    `SELECT s.id::text AS id, s.label, s.scopes, s.masks, s.created_at, s.expires_at, s.revoked_at, s.view_count, s.last_viewed_at,
            s.user_id::text AS owner_id, u.status AS owner_status
       FROM myfp.share_links s JOIN myfp.users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [tokenHash],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerStatus: r.owner_status,
    scopes: normalizeScopes(r.scopes),
    masks: normalizeMasks(r.masks),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  };
}

export async function recordShareView(db: Db, id: string): Promise<void> {
  await db.query("UPDATE myfp.share_links SET view_count = view_count + 1, last_viewed_at = now() WHERE id = $1", [id]);
}
