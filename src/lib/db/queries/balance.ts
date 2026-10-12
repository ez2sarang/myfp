// 자산·부채 저장소 (서버 전용, Db 주입). 모든 쿼리는 WHERE user_id = <세션 사용자> 로 범위를 묶는다.
import { seoulToday } from "../../finance/dates.ts";
import type { BalanceInput } from "../../finance/validate.ts";
import { LIMITS, type BalanceCategory, type BalanceItem, type BalanceKind } from "../../finance/types.ts";
import { isUuid, type Db } from "../types.ts";
import { hasColumn } from "./columns.ts";

/** 나만 보기 저장 (0008 의 private 열이 있을 때만; 없으면 건너뛴다) */
async function savePrivate(db: Db, userId: string, id: string, value: boolean | undefined): Promise<void> {
  if (value === undefined || !(await hasColumn(db, "balance_items", "private"))) return;
  await db.query("UPDATE myfp.balance_items SET private = $3 WHERE user_id = $1 AND id = $2", [userId, id, value]);
}
import type { WriteResult } from "./fixed.ts";

export const BALANCE_COLUMNS = `id::text AS id, kind, category, name, amount::text AS amount, to_char(as_of, 'YYYY-MM-DD') AS as_of, note,
  monthly_payment::text AS monthly_payment, interest_rate::text AS interest_rate, to_char(end_date, 'YYYY-MM-DD') AS end_date,
  COALESCE((to_jsonb(balance_items) ->> 'private')::boolean, false) AS private`;

export interface BalanceRow {
  id: string;
  kind: BalanceKind;
  category: BalanceCategory;
  name: string;
  amount: string;
  as_of: string | null;
  note: string | null;
  monthly_payment: string | null;
  interest_rate: string | null;
  end_date: string | null;
  private?: boolean;
}

export function balanceFromRow(r: BalanceRow): BalanceItem {
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    name: r.name,
    amount: Number(r.amount),
    asOf: r.as_of,
    note: r.note,
    monthlyPayment: r.monthly_payment === null ? null : Number(r.monthly_payment),
    interestRate: r.interest_rate === null ? null : Number(r.interest_rate),
    endDate: r.end_date,
    private: r.private === true,
  };
}

export async function listBalances(db: Db, userId: string): Promise<BalanceItem[]> {
  const res = await db.query<BalanceRow>(
    `SELECT ${BALANCE_COLUMNS} FROM myfp.balance_items WHERE user_id = $1 ORDER BY kind, amount DESC, id`,
    [userId],
  );
  return res.rows.map(balanceFromRow);
}

export async function getBalance(db: Db, userId: string, id: string): Promise<BalanceItem | null> {
  if (!isUuid(id)) return null;
  const res = await db.query<BalanceRow>(`SELECT ${BALANCE_COLUMNS} FROM myfp.balance_items WHERE user_id = $1 AND id = $2`, [userId, id]);
  return res.rows[0] ? balanceFromRow(res.rows[0]) : null;
}

const valuesOf = (v: BalanceInput) => [v.kind, v.category, v.name, v.amount, v.asOf, v.note, v.monthlyPayment, v.interestRate, v.endDate];

const currentMonth = (): string => seoulToday().slice(0, 7);

/** 그 달의 순자산 스냅샷(자산 합계·부채 합계)을 지금 잔액으로 갱신한다. 자산·부채를 바꾸는 같은 트랜잭션 안에서 부른다. */
export async function upsertBalanceSnapshot(db: Db, userId: string, month: string = currentMonth()): Promise<void> {
  await db.query(
    `INSERT INTO myfp.balance_snapshots (user_id, month, assets_total, liabilities_total)
     SELECT $1, $2, COALESCE(sum(amount) FILTER (WHERE kind = 'asset'), 0), COALESCE(sum(amount) FILTER (WHERE kind = 'liability'), 0)
       FROM myfp.balance_items WHERE user_id = $1
     ON CONFLICT (user_id, month) DO UPDATE
       SET assets_total = EXCLUDED.assets_total, liabilities_total = EXCLUDED.liabilities_total, updated_at = now()`,
    [userId, month],
  );
}

export interface BalanceSnapshot {
  month: string;
  assetsTotal: number;
  liabilitiesTotal: number;
}

/** 최근 months 개월의 스냅샷 (오래된 달 → 최근 달) */
export async function listSnapshots(db: Db, userId: string, months = 24): Promise<BalanceSnapshot[]> {
  const res = await db.query<{ month: string; assets_total: string; liabilities_total: string }>(
    `SELECT month, assets_total::text AS assets_total, liabilities_total::text AS liabilities_total
       FROM myfp.balance_snapshots WHERE user_id = $1 ORDER BY month DESC LIMIT $2`,
    [userId, months],
  );
  return res.rows
    .map((r) => ({ month: r.month, assetsTotal: Number(r.assets_total), liabilitiesTotal: Number(r.liabilities_total) }))
    .reverse();
}

export async function createBalance(db: Db, userId: string, input: BalanceInput): Promise<WriteResult> {
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM myfp.balance_items WHERE user_id = $1", [userId]);
  if (Number(count.rows[0]?.n ?? 0) >= LIMITS.balanceItems) return { ok: false, reason: "limit" };
  const res = await db.query<{ id: string }>(
    `INSERT INTO myfp.balance_items (user_id, kind, category, name, amount, as_of, note, monthly_payment, interest_rate, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text AS id`,
    [userId, ...valuesOf(input)],
  );
  const id = (res.rows[0] as { id: string }).id;
  await savePrivate(db, userId, id, input.private);
  await upsertBalanceSnapshot(db, userId);
  return { ok: true, id };
}

export async function updateBalance(db: Db, userId: string, id: string, input: BalanceInput): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, reason: "not_found" };
  // 같은 사용자의 동시 변경을 줄 세운다 (스냅샷 합계가 엇갈리지 않게, create 와 같은 잠금)
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const res = await db.query<{ id: string }>(
    `UPDATE myfp.balance_items SET kind = $3, category = $4, name = $5, amount = $6, as_of = $7, note = $8, monthly_payment = $9,
       interest_rate = $10, end_date = $11, updated_at = now()
     WHERE user_id = $1 AND id = $2 RETURNING id::text AS id`,
    [userId, id, ...valuesOf(input)],
  );
  if (!res.rows[0]) return { ok: false, reason: "not_found" };
  await savePrivate(db, userId, id, input.private);
  await upsertBalanceSnapshot(db, userId);
  return { ok: true, id };
}

export async function deleteBalance(db: Db, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const res = await db.query("DELETE FROM myfp.balance_items WHERE user_id = $1 AND id = $2", [userId, id]);
  if ((res.rowCount ?? 0) === 0) return false;
  await upsertBalanceSnapshot(db, userId);
  return true;
}
