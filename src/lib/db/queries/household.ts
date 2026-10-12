// 함께 보기(그룹) 저장소 (서버 전용, Db 주입).
//  - 다른 사용자 데이터를 읽는 곳은 visibleToViewer 하나뿐이다. 모든 조회가 "열람자의 그룹 ↔ 대상 구성원" 조인에서 시작하고,
//    내놓은 범위(share_fixed·share_balances)·'나만 보기' 제외(private = false)·보관한 고정지출 제외(archived_at IS NULL, 지난 달 포함)·
//    활성 계정(열람자와 대상 모두)을 SQL 이 강제한다.
//    입력은 세션 사용자 id 하나이고, 클라이언트가 보낸 사용자 id·그룹 id 는 받지 않는다.
//  - 보내는 필드는 이름·분류·금액·주기·납부일·기간·활성뿐이다(메모·기관/카드명·출처·결제수단은 조회하지 않는다).
//    항목 id·사용자 id 는 결과에 싣지 않고 서버가 만든 불투명 키(m1~m6, m1-3 …)로 바꾼다.
//  - 그룹 변경은 모두 세션 사용자의 구성원 행에서 그룹을 찾는다(방장 권한도 DB 에서 다시 확인). 감사 기록에는 그룹 id 만 남긴다.
import type { FixedOverride } from "../../finance/occurrences.ts";
import type { BalanceKind, Cycle, ExpenseCategory } from "../../finance/types.ts";
import { INVITE_DAYS, MAX_ACTIVE_INVITES, MAX_MEMBERS, MEMBER_COLORS, pickSuccessor, type MemberRef } from "../../household/rules.ts";
import { isUuid, type Db } from "../types.ts";
import { writeAudit } from "./audit.ts";

const codeOf = (error: unknown) => (typeof error === "object" && error !== null ? String((error as { code?: unknown }).code ?? "") : "");
/** 0006·0008 적용 전(테이블·열 없음) */
const missingSchema = (error: unknown) => ["42P01", "42703"].includes(codeOf(error));

export interface Membership {
  householdId: string;
  householdName: string;
  role: "owner" | "member";
  tag: string;
  shareFixed: boolean;
  shareBalances: boolean;
}

/** 세션 사용자의 그룹 구성원 정보 (없으면 null, 0008 적용 전에도 null) */
export async function getMembership(db: Db, userId: string): Promise<Membership | null> {
  try {
    const res = await db.query<{ household_id: string; name: string; role: "owner" | "member"; tag: string; share_fixed: boolean; share_balances: boolean }>(
      `SELECT m.household_id::text AS household_id, h.name, m.role, m.tag, m.share_fixed, m.share_balances
         FROM myfp.household_members m JOIN myfp.households h ON h.id = m.household_id
        WHERE m.user_id = $1`,
      [userId],
    );
    const r = res.rows[0];
    return r ? { householdId: r.household_id, householdName: r.name, role: r.role, tag: r.tag, shareFixed: r.share_fixed, shareBalances: r.share_balances } : null;
  } catch (error) {
    if (missingSchema(error)) return null;
    throw error;
  }
}

export interface HouseholdMember {
  /** 서버가 만든 키 (가입 순 m1~m6). 화면·쿼리는 이것만 쓴다 */
  key: string;
  tag: string;
  role: "owner" | "member";
  isSelf: boolean;
  /** 계정이 활성일 때만 데이터가 합산된다 */
  active: boolean;
  shareFixed: boolean;
  shareBalances: boolean;
  color: string;
}

export interface HouseholdFixed {
  /** 불투명 키 (예: m2-5) */
  id: string;
  ownerKey: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  cycle: Cycle;
  billingDay: number | null;
  billingMonth: number | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  archived: boolean;
  /** 등록일(서울) — 시작일이 없을 때 과거 발생의 하한 */
  createdOn: string | null;
}

export interface HouseholdBalance {
  ownerKey: string;
  kind: BalanceKind;
  category: string;
  name: string;
  amount: number;
  endDate: string | null;
}

export interface HouseholdData {
  name: string;
  members: HouseholdMember[];
  fixed: HouseholdFixed[];
  overrides: FixedOverride[];
  balances: HouseholdBalance[];
}

// 열람자 → 같은 그룹의 활성 구성원 (열람자 자신도 활성이어야 한다)
const VISIBLE_MEMBERS = `FROM myfp.household_members me
  JOIN myfp.users vu ON vu.id = me.user_id AND vu.status = 'active'
  JOIN myfp.household_members m ON m.household_id = me.household_id
  JOIN myfp.users u ON u.id = m.user_id AND u.status = 'active'`;

/**
 * 열람자가 볼 수 있는 그룹 데이터 (다른 사용자 데이터를 읽는 유일한 함수). 그룹이 없으면 null.
 * 구성원 목록은 비활성 계정도 표시만 하고(데이터 없음), 데이터 쿼리는 활성 구성원·내놓은 범위·'나만 보기' 제외로 묶는다.
 */
export async function visibleToViewer(db: Db, viewerId: string): Promise<HouseholdData | null> {
  if (!isUuid(viewerId)) return null;
  let memberRows: { household_name: string; user_id: string; role: "owner" | "member"; tag: string; share_fixed: boolean; share_balances: boolean; status: string }[];
  try {
    const res = await db.query<(typeof memberRows)[number]>(
      `SELECT h.name AS household_name, m.user_id::text AS user_id, m.role, m.tag, m.share_fixed, m.share_balances, u.status
         FROM myfp.household_members me
         JOIN myfp.users vu ON vu.id = me.user_id AND vu.status = 'active'
         JOIN myfp.households h ON h.id = me.household_id
         JOIN myfp.household_members m ON m.household_id = me.household_id
         JOIN myfp.users u ON u.id = m.user_id
        WHERE me.user_id = $1
        ORDER BY m.joined_at, m.user_id`,
      [viewerId],
    );
    memberRows = res.rows;
  } catch (error) {
    if (missingSchema(error)) return null;
    throw error;
  }
  if (memberRows.length === 0) return null;
  const keyOf = new Map(memberRows.map((r, i) => [r.user_id, `m${i + 1}`]));
  const members: HouseholdMember[] = memberRows.map((r, i) => ({
    key: `m${i + 1}`,
    tag: r.tag,
    role: r.role,
    isSelf: r.user_id === viewerId,
    active: r.status === "active",
    shareFixed: r.share_fixed,
    shareBalances: r.share_balances,
    color: MEMBER_COLORS[i % MEMBER_COLORS.length] as string,
  }));

  const fixedRes = await db.query<{
    owner_id: string;
    id: string;
    name: string;
    category: ExpenseCategory;
    amount: string;
    cycle: Cycle;
    billing_day: number | null;
    billing_month: number | null;
    start_date: string | null;
    end_date: string | null;
    active: boolean;
    archived: boolean;
    created_on: string | null;
  }>(
    `SELECT m.user_id::text AS owner_id, f.id::text AS id, f.name, f.category, f.amount::text AS amount, f.cycle, f.billing_day, f.billing_month,
            to_char(f.start_date, 'YYYY-MM-DD') AS start_date, to_char(f.end_date, 'YYYY-MM-DD') AS end_date, f.active, (f.archived_at IS NOT NULL) AS archived,
            to_char((f.created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS created_on
       ${VISIBLE_MEMBERS}
       JOIN myfp.fixed_expenses f ON f.user_id = m.user_id
      WHERE me.user_id = $1 AND m.share_fixed = true AND f.private = false AND f.archived_at IS NULL
      ORDER BY m.joined_at, f.created_at, f.id`,
    [viewerId],
  );
  // 실제 항목 id → 불투명 키 (덮어쓰기 연결에만 서버 안에서 쓴다)
  const opaque = new Map<string, string>();
  const counters = new Map<string, number>();
  const fixed: HouseholdFixed[] = [];
  for (const r of fixedRes.rows) {
    const ownerKey = keyOf.get(r.owner_id);
    if (!ownerKey) continue;
    const n = (counters.get(ownerKey) ?? 0) + 1;
    counters.set(ownerKey, n);
    const id = `${ownerKey}-${n}`;
    opaque.set(r.id, id);
    fixed.push({
      id,
      ownerKey,
      name: r.name,
      category: r.category,
      amount: Number(r.amount),
      cycle: r.cycle,
      billingDay: r.billing_day === null ? null : Number(r.billing_day),
      billingMonth: r.billing_month === null ? null : Number(r.billing_month),
      startDate: r.start_date,
      endDate: r.end_date,
      active: r.active,
      archived: r.archived,
      createdOn: r.created_on ?? null,
    });
  }

  let overrides: FixedOverride[] = [];
  try {
    const res = await db.query<{ fixed_expense_id: string; month: string; amount: string | null; skipped: boolean }>(
      `SELECT o.fixed_expense_id::text AS fixed_expense_id, o.month, o.amount::text AS amount, o.skipped
         ${VISIBLE_MEMBERS}
         JOIN myfp.fixed_expenses f ON f.user_id = m.user_id AND f.private = false AND f.archived_at IS NULL
         JOIN myfp.fixed_overrides o ON o.fixed_expense_id = f.id AND o.user_id = m.user_id
        WHERE me.user_id = $1 AND m.share_fixed = true`,
      [viewerId],
    );
    overrides = res.rows.flatMap((r) => {
      const id = opaque.get(r.fixed_expense_id);
      return id ? [{ fixedExpenseId: id, month: r.month, amount: r.amount === null ? null : Number(r.amount), skipped: r.skipped }] : [];
    });
  } catch (error) {
    if (!missingSchema(error)) throw error;
  }

  const balRes = await db.query<{ owner_id: string; kind: BalanceKind; category: string; name: string; amount: string; end_date: string | null }>(
    `SELECT m.user_id::text AS owner_id, b.kind, b.category, b.name, b.amount::text AS amount, to_char(b.end_date, 'YYYY-MM-DD') AS end_date
       ${VISIBLE_MEMBERS}
       JOIN myfp.balance_items b ON b.user_id = m.user_id
      WHERE me.user_id = $1 AND m.share_balances = true AND b.private = false
      ORDER BY m.joined_at, b.kind, b.name, b.id`,
    [viewerId],
  );
  const balances = balRes.rows.flatMap((r) => {
    const ownerKey = keyOf.get(r.owner_id);
    return ownerKey ? [{ ownerKey, kind: r.kind, category: r.category, name: r.name, amount: Number(r.amount), endDate: r.end_date }] : [];
  });

  return { name: memberRows[0]!.household_name, members, fixed, overrides, balances };
}

export type HouseholdWrite =
  | { ok: true }
  | { ok: false; reason: "already_member" | "not_member" | "not_owner" | "not_found" | "full" | "limit" | "tag_taken" | "self" };

async function lockUser(db: Db, userId: string) {
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
}

/** 그룹 만들기 (만든 사람이 방장). 이미 다른 그룹 구성원이면 거부. 트랜잭션 안에서 부른다. */
export async function createHousehold(db: Db, userId: string, name: string, tag: string): Promise<HouseholdWrite> {
  await lockUser(db, userId);
  const existing = await db.query("SELECT 1 FROM myfp.household_members WHERE user_id = $1", [userId]);
  if (existing.rows.length > 0) return { ok: false, reason: "already_member" };
  const res = await db.query<{ id: string }>("INSERT INTO myfp.households (name, created_by) VALUES ($1, $2) RETURNING id::text AS id", [name, userId]);
  const householdId = (res.rows[0] as { id: string }).id;
  await db.query(
    "INSERT INTO myfp.household_members (household_id, user_id, role, tag, share_fixed, share_balances) VALUES ($1, $2, 'owner', $3, true, false)",
    [householdId, userId, tag],
  );
  await writeAudit(db, { actorUserId: userId, action: "household.create", targetType: "household", targetKey: householdId });
  return { ok: true };
}

/** 방장의 그룹 id (방장이 아니면 null). 그룹 행을 잠근다 */
async function ownedHousehold(db: Db, userId: string): Promise<string | null> {
  const res = await db.query<{ household_id: string }>(
    "SELECT household_id::text AS household_id FROM myfp.household_members WHERE user_id = $1 AND role = 'owner'",
    [userId],
  );
  const id = res.rows[0]?.household_id ?? null;
  if (id) await db.query("SELECT id FROM myfp.households WHERE id = $1 FOR UPDATE", [id]);
  return id;
}

export async function renameHousehold(db: Db, userId: string, name: string): Promise<HouseholdWrite> {
  const res = await db.query(
    "UPDATE myfp.households SET name = $2 WHERE id = (SELECT household_id FROM myfp.household_members WHERE user_id = $1 AND role = 'owner')",
    [userId, name],
  );
  return (res.rowCount ?? 0) > 0 ? { ok: true } : { ok: false, reason: "not_owner" };
}

/** 초대 만들기 (방장만, 단회용·7일, 활성 초대 최대 5개, 그룹이 꽉 차면 거부). 토큰 원문은 받지 않고 해시만 저장한다. */
export async function createInvite(db: Db, userId: string, tokenHash: string): Promise<HouseholdWrite> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return { ok: false, reason: "not_found" };
  const householdId = await ownedHousehold(db, userId);
  if (!householdId) return { ok: false, reason: "not_owner" };
  const members = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM myfp.household_members WHERE household_id = $1", [householdId]);
  if (Number(members.rows[0]?.n ?? 0) >= MAX_MEMBERS) return { ok: false, reason: "full" };
  const invites = await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM myfp.household_invites WHERE household_id = $1 AND used_at IS NULL AND expires_at > now()",
    [householdId],
  );
  if (Number(invites.rows[0]?.n ?? 0) >= MAX_ACTIVE_INVITES) return { ok: false, reason: "limit" };
  const res = await db.query<{ id: string }>(
    `INSERT INTO myfp.household_invites (household_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4)) RETURNING id::text AS id`,
    [householdId, tokenHash, userId, INVITE_DAYS],
  );
  await writeAudit(db, { actorUserId: userId, action: "household.invite", targetType: "household", targetKey: householdId, after: { invite: res.rows[0]?.id } });
  return { ok: true };
}

export interface InviteRow {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

/** 방장의 초대 목록 (토큰은 없다). 방장이 아니면 빈 목록 */
export async function listInvites(db: Db, userId: string): Promise<InviteRow[]> {
  const res = await db.query<{ id: string; created_at: Date; expires_at: Date; used_at: Date | null }>(
    `SELECT i.id::text AS id, i.created_at, i.expires_at, i.used_at FROM myfp.household_invites i
      WHERE i.household_id = (SELECT household_id FROM myfp.household_members WHERE user_id = $1 AND role = 'owner')
      ORDER BY i.created_at DESC LIMIT 20`,
    [userId],
  );
  return res.rows.map((r) => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at, usedAt: r.used_at }));
}

/** 쓰지 않은 초대 취소 (방장만, 자기 그룹 초대만) */
export async function revokeInvite(db: Db, userId: string, inviteId: string): Promise<boolean> {
  if (!isUuid(inviteId)) return false;
  const res = await db.query(
    `DELETE FROM myfp.household_invites
      WHERE id = $2 AND used_at IS NULL AND household_id = (SELECT household_id FROM myfp.household_members WHERE user_id = $1 AND role = 'owner')`,
    [userId, inviteId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** 초대 확인 화면용: 쓰지 않았고 만료 전인 초대의 그룹 이름. 그 외(없음·사용됨·만료)는 모두 null */
export async function findInvite(db: Db, tokenHash: string): Promise<{ householdName: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return null;
  try {
    const res = await db.query<{ name: string }>(
      `SELECT h.name FROM myfp.household_invites i JOIN myfp.households h ON h.id = i.household_id
        WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()`,
      [tokenHash],
    );
    return res.rows[0] ? { householdName: res.rows[0].name } : null;
  } catch (error) {
    if (missingSchema(error)) return null;
    throw error;
  }
}

/**
 * 초대 수락 (트랜잭션 안에서). 순서: 사용자 행 잠금 → 이미 구성원이면 거부 → 초대로 그룹 찾기 → 그룹 행 잠금 →
 * 인원(6)·태그 중복 확인 → 초대 소비(used_at IS NULL 조건부 UPDATE) → 구성원 추가. 같은 초대를 동시에 수락하면 그룹 잠금 뒤
 * 소비 UPDATE 가 한 번만 성공한다. DB 의 유일성(사용자당 한 그룹·그룹 안 태그)이 마지막 방어선이다.
 */
export async function acceptInvite(
  db: Db,
  userId: string,
  tokenHash: string,
  input: { tag: string; shareFixed: boolean; shareBalances: boolean },
): Promise<HouseholdWrite> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return { ok: false, reason: "not_found" };
  await lockUser(db, userId);
  const existing = await db.query("SELECT 1 FROM myfp.household_members WHERE user_id = $1", [userId]);
  if (existing.rows.length > 0) return { ok: false, reason: "already_member" };
  const invite = await db.query<{ household_id: string }>(
    "SELECT household_id::text AS household_id FROM myfp.household_invites WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
    [tokenHash],
  );
  const householdId = invite.rows[0]?.household_id;
  if (!householdId) return { ok: false, reason: "not_found" };
  await db.query("SELECT id FROM myfp.households WHERE id = $1 FOR UPDATE", [householdId]);
  const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM myfp.household_members WHERE household_id = $1", [householdId]);
  if (Number(count.rows[0]?.n ?? 0) >= MAX_MEMBERS) return { ok: false, reason: "full" };
  const taken = await db.query("SELECT 1 FROM myfp.household_members WHERE household_id = $1 AND tag = $2", [householdId, input.tag]);
  if (taken.rows.length > 0) return { ok: false, reason: "tag_taken" };
  const used = await db.query(
    "UPDATE myfp.household_invites SET used_at = now(), used_by = $2 WHERE token_hash = $1 AND household_id = $3 AND used_at IS NULL AND expires_at > now()",
    [tokenHash, userId, householdId],
  );
  if ((used.rowCount ?? 0) === 0) return { ok: false, reason: "not_found" };
  await db.query(
    "INSERT INTO myfp.household_members (household_id, user_id, role, tag, share_fixed, share_balances) VALUES ($1, $2, 'member', $3, $4, $5)",
    [householdId, userId, input.tag, input.shareFixed, input.shareBalances],
  );
  await writeAudit(db, { actorUserId: userId, action: "household.join", targetType: "household", targetKey: householdId });
  return { ok: true };
}

/** 내 태그·내놓을 범위 바꾸기 (내 구성원 행만) */
export async function updateMyMembership(db: Db, userId: string, input: { tag: string; shareFixed: boolean; shareBalances: boolean }): Promise<HouseholdWrite> {
  const mine = await db.query<{ household_id: string }>("SELECT household_id::text AS household_id FROM myfp.household_members WHERE user_id = $1", [userId]);
  const householdId = mine.rows[0]?.household_id;
  if (!householdId) return { ok: false, reason: "not_member" };
  const taken = await db.query("SELECT 1 FROM myfp.household_members WHERE household_id = $1 AND tag = $2 AND user_id <> $3", [householdId, input.tag, userId]);
  if (taken.rows.length > 0) return { ok: false, reason: "tag_taken" };
  await db.query("UPDATE myfp.household_members SET tag = $2, share_fixed = $3, share_balances = $4 WHERE user_id = $1", [
    userId,
    input.tag,
    input.shareFixed,
    input.shareBalances,
  ]);
  return { ok: true };
}

/** 구성원 내보내기 (방장만, 자기 그룹의 다른 구성원만). 대상은 태그로 찾는다(그룹 안에서 유일, 사용자 id 를 받지 않는다). */
export async function removeMember(db: Db, ownerId: string, tag: string): Promise<HouseholdWrite> {
  const householdId = await ownedHousehold(db, ownerId);
  if (!householdId) return { ok: false, reason: "not_owner" };
  const target = await db.query<{ user_id: string }>("SELECT user_id::text AS user_id FROM myfp.household_members WHERE household_id = $1 AND tag = $2", [
    householdId,
    tag,
  ]);
  const targetId = target.rows[0]?.user_id;
  if (!targetId) return { ok: false, reason: "not_found" };
  if (targetId === ownerId) return { ok: false, reason: "self" };
  await db.query("DELETE FROM myfp.household_members WHERE household_id = $1 AND user_id = $2 AND role = 'member'", [householdId, targetId]);
  await writeAudit(db, { actorUserId: ownerId, action: "household.remove", targetType: "household", targetKey: householdId });
  return { ok: true };
}

/**
 * 그룹에서 나가기. 방장이면 가장 먼저 가입한 구성원에게 방장을 넘기고, 남는 사람이 없으면 그룹(초대 포함)을 지운다.
 * 계정 삭제(deleteAccount)도 같은 함수를 부른다. 트랜잭션 안에서 부른다.
 */
export async function leaveHousehold(db: Db, userId: string, opts: { audit?: boolean } = {}): Promise<HouseholdWrite> {
  const mine = await db.query<{ household_id: string; role: "owner" | "member" }>(
    "SELECT household_id::text AS household_id, role FROM myfp.household_members WHERE user_id = $1",
    [userId],
  );
  const row = mine.rows[0];
  if (!row) return { ok: false, reason: "not_member" };
  await db.query("SELECT id FROM myfp.households WHERE id = $1 FOR UPDATE", [row.household_id]);
  await db.query("DELETE FROM myfp.household_members WHERE household_id = $1 AND user_id = $2", [row.household_id, userId]);
  if (row.role === "owner") {
    // 승계 후보는 활성 계정 우선(없으면 가장 먼저 가입한 구성원)
    const rest = await db.query<{ user_id: string; role: "owner" | "member"; joined_at: Date; status: string }>(
      `SELECT m.user_id::text AS user_id, m.role, m.joined_at, u.status
         FROM myfp.household_members m JOIN myfp.users u ON u.id = m.user_id
        WHERE m.household_id = $1`,
      [row.household_id],
    );
    const successor = pickSuccessor(
      rest.rows.map((r): MemberRef => ({ userId: r.user_id, role: r.role, joinedAt: new Date(r.joined_at), active: r.status === "active" })),
      userId,
    );
    if (successor) {
      await db.query("UPDATE myfp.household_members SET role = 'owner' WHERE household_id = $1 AND user_id = $2", [row.household_id, successor]);
    } else {
      await db.query("DELETE FROM myfp.households WHERE id = $1", [row.household_id]);
    }
  }
  if (opts.audit !== false) {
    await writeAudit(db, { actorUserId: userId, action: "household.leave", targetType: "household", targetKey: row.household_id });
  }
  return { ok: true };
}

/** 그룹 지우기 (방장만): 구성원·초대가 함께 지워진다 */
export async function deleteHousehold(db: Db, ownerId: string): Promise<HouseholdWrite> {
  const householdId = await ownedHousehold(db, ownerId);
  if (!householdId) return { ok: false, reason: "not_owner" };
  await db.query("DELETE FROM myfp.households WHERE id = $1", [householdId]);
  await writeAudit(db, { actorUserId: ownerId, action: "household.delete", targetType: "household", targetKey: householdId });
  return { ok: true };
}
