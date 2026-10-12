// 고정지출 저장소 (서버 전용, Db 주입). 모든 쿼리는 사용자 id 로 범위를 묶는다: 읽기·수정·삭제 모두 WHERE user_id = <세션 사용자>.
// userId 는 항상 서버 세션에서 온 값이고, 폼에서 온 값을 받지 않는다(함수 인자로만 받는다).
import type { FixedInput } from "../../finance/validate.ts";
import { LIMITS, type Cycle, type ExpenseCategory, type ExpenseSource, type FixedExpense, type PaymentMethod } from "../../finance/types.ts";
import { isUuid, type Db } from "../types.ts";
import { hasColumn } from "./columns.ts";

/** 나만 보기 저장 (0008 의 private 열이 있을 때만; 없으면 건너뛴다) */
async function savePrivate(db: Db, userId: string, id: string, value: boolean | undefined): Promise<void> {
  if (value === undefined || !(await hasColumn(db, "fixed_expenses", "private"))) return;
  await db.query("UPDATE myfp.fixed_expenses SET private = $3 WHERE user_id = $1 AND id = $2", [userId, id, value]);
}

export const FIXED_COLUMNS = `id::text AS id, name, category, amount::text AS amount, cycle, billing_day, billing_month, payment_method, institution,
  to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, active, note, source,
  (archived_at IS NOT NULL) AS archived, COALESCE((to_jsonb(fixed_expenses) ->> 'private')::boolean, false) AS private`;

export interface FixedRow {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: string;
  cycle: Cycle;
  billing_day: number | null;
  billing_month: number | null;
  payment_method: PaymentMethod | null;
  institution: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  note: string | null;
  source: ExpenseSource;
  archived: boolean;
  private?: boolean;
}

export function fixedFromRow(r: FixedRow): FixedExpense {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    amount: Number(r.amount),
    cycle: r.cycle,
    billingDay: r.billing_day === null ? null : Number(r.billing_day),
    billingMonth: r.billing_month === null ? null : Number(r.billing_month),
    paymentMethod: r.payment_method,
    institution: r.institution,
    startDate: r.start_date,
    endDate: r.end_date,
    active: r.active,
    note: r.note,
    source: r.source,
    archived: r.archived,
    private: r.private === true,
  };
}

export async function listFixed(db: Db, userId: string): Promise<FixedExpense[]> {
  const res = await db.query<FixedRow>(`SELECT ${FIXED_COLUMNS} FROM myfp.fixed_expenses WHERE user_id = $1 ORDER BY created_at, id`, [userId]);
  return res.rows.map(fixedFromRow);
}

export async function getFixed(db: Db, userId: string, id: string): Promise<FixedExpense | null> {
  if (!isUuid(id)) return null;
  const res = await db.query<FixedRow>(`SELECT ${FIXED_COLUMNS} FROM myfp.fixed_expenses WHERE user_id = $1 AND id = $2`, [userId, id]);
  return res.rows[0] ? fixedFromRow(res.rows[0]) : null;
}

const valuesOf = (v: FixedInput) => [
  v.name,
  v.category,
  v.amount,
  v.cycle,
  v.billingDay,
  v.billingMonth,
  v.paymentMethod,
  v.institution,
  v.startDate,
  v.endDate,
  v.active,
  v.note,
  v.source,
];

export type WriteResult = { ok: true; id: string } | { ok: false; reason: "limit" | "not_found" };

/** 상한(사용자당 300건)을 넘지 않게 사용자 행을 잠근 뒤 센다. 호출하는 쪽이 트랜잭션으로 감싼다. */
export async function createFixed(db: Db, userId: string, input: FixedInput): Promise<WriteResult> {
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM myfp.fixed_expenses WHERE user_id = $1", [userId]);
  if (Number(count.rows[0]?.n ?? 0) >= LIMITS.fixedExpenses) return { ok: false, reason: "limit" };
  const res = await db.query<{ id: string }>(
    `INSERT INTO myfp.fixed_expenses (user_id, name, category, amount, cycle, billing_day, billing_month, payment_method, institution,
       start_date, end_date, active, note, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id::text AS id`,
    [userId, ...valuesOf(input)],
  );
  const id = (res.rows[0] as { id: string }).id;
  await savePrivate(db, userId, id, input.private);
  return { ok: true, id };
}

export async function updateFixed(db: Db, userId: string, id: string, input: FixedInput): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, reason: "not_found" };
  const res = await db.query<{ id: string }>(
    `UPDATE myfp.fixed_expenses SET name = $3, category = $4, amount = $5, cycle = $6, billing_day = $7, billing_month = $8,
       payment_method = $9, institution = $10, start_date = $11, end_date = $12, active = $13, note = $14, source = $15, updated_at = now()
     WHERE user_id = $1 AND id = $2 RETURNING id::text AS id`,
    [userId, id, ...valuesOf(input)],
  );
  if (!res.rows[0]) return { ok: false, reason: "not_found" };
  await savePrivate(db, userId, id, input.private);
  return { ok: true, id };
}

export async function setFixedActive(db: Db, userId: string, id: string, active: boolean): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db.query("UPDATE myfp.fixed_expenses SET active = $3, updated_at = now() WHERE user_id = $1 AND id = $2", [userId, id, active]);
  return (res.rowCount ?? 0) > 0;
}

/** 보관(소프트 삭제) 또는 보관 해제 */
export async function setFixedArchived(db: Db, userId: string, id: string, archived: boolean): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db.query(
    `UPDATE myfp.fixed_expenses SET archived_at = CASE WHEN $3 THEN now() ELSE NULL END, updated_at = now() WHERE user_id = $1 AND id = $2`,
    [userId, id, archived],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteFixed(db: Db, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db.query("DELETE FROM myfp.fixed_expenses WHERE user_id = $1 AND id = $2", [userId, id]);
  return (res.rowCount ?? 0) > 0;
}
