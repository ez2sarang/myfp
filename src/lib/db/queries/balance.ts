// 자산·부채 저장소 (서버 전용, Db 주입). 모든 쿼리는 WHERE user_id = <세션 사용자> 로 범위를 묶는다.
import type { BalanceInput } from "../../finance/validate.ts";
import { LIMITS, type BalanceCategory, type BalanceItem, type BalanceKind } from "../../finance/types.ts";
import { isUuid, type Db } from "../types.ts";
import type { WriteResult } from "./fixed.ts";

export const BALANCE_COLUMNS = `id::text AS id, kind, category, name, amount::text AS amount, to_char(as_of, 'YYYY-MM-DD') AS as_of, note,
  monthly_payment::text AS monthly_payment, interest_rate::text AS interest_rate, to_char(end_date, 'YYYY-MM-DD') AS end_date`;

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

export async function createBalance(db: Db, userId: string, input: BalanceInput): Promise<WriteResult> {
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM myfp.balance_items WHERE user_id = $1", [userId]);
  if (Number(count.rows[0]?.n ?? 0) >= LIMITS.balanceItems) return { ok: false, reason: "limit" };
  const res = await db.query<{ id: string }>(
    `INSERT INTO myfp.balance_items (user_id, kind, category, name, amount, as_of, note, monthly_payment, interest_rate, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text AS id`,
    [userId, ...valuesOf(input)],
  );
  return { ok: true, id: (res.rows[0] as { id: string }).id };
}

export async function updateBalance(db: Db, userId: string, id: string, input: BalanceInput): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, reason: "not_found" };
  const res = await db.query<{ id: string }>(
    `UPDATE myfp.balance_items SET kind = $3, category = $4, name = $5, amount = $6, as_of = $7, note = $8, monthly_payment = $9,
       interest_rate = $10, end_date = $11, updated_at = now()
     WHERE user_id = $1 AND id = $2 RETURNING id::text AS id`,
    [userId, id, ...valuesOf(input)],
  );
  return res.rows[0] ? { ok: true, id } : { ok: false, reason: "not_found" };
}

export async function deleteBalance(db: Db, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db.query("DELETE FROM myfp.balance_items WHERE user_id = $1 AND id = $2", [userId, id]);
  return (res.rowCount ?? 0) > 0;
}
