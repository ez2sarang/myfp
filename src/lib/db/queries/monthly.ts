// 월 단위 모델 저장소 (서버 전용, Db 주입): 달별 덮어쓰기(fixed_overrides)·예정지출(planned_expenses).
// 모든 쿼리는 세션 사용자 id(userId 인자)로 범위를 묶는다. 항목 id·묶음 id 는 언제나 user_id 와 함께 조건으로 쓴다.
// 0006 마이그레이션 전에는 두 테이블이 없으므로 읽기는 빈 목록으로 돌려준다(42P01). 쓰기는 실패하고 호출하는 쪽이 안내한다.
import { randomUUID } from "node:crypto";
import type { PlannedInput } from "../../finance/monthly-validate.ts";
import { installmentDates, type FixedOverride, type PlannedExpense, type PlannedStatus } from "../../finance/occurrences.ts";
import { LIMITS, type ExpenseCategory } from "../../finance/types.ts";
import { isUuid, type Db } from "../types.ts";

const missingTable = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";

export async function listOverrides(db: Db, userId: string): Promise<FixedOverride[]> {
  try {
    const res = await db.query<{ fixed_expense_id: string; month: string; amount: string | null; skipped: boolean }>(
      "SELECT fixed_expense_id::text AS fixed_expense_id, month, amount::text AS amount, skipped FROM myfp.fixed_overrides WHERE user_id = $1 ORDER BY month, fixed_expense_id",
      [userId],
    );
    return res.rows.map((r) => ({ fixedExpenseId: r.fixed_expense_id, month: r.month, amount: r.amount === null ? null : Number(r.amount), skipped: r.skipped }));
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
}

interface PlannedRow {
  id: string;
  due_date: string;
  name: string;
  category: ExpenseCategory;
  amount: string;
  status: PlannedStatus;
  note: string | null;
  group_id: string | null;
  seq: number | null;
  total: number | null;
}

export async function listPlanned(db: Db, userId: string): Promise<PlannedExpense[]> {
  try {
    const res = await db.query<PlannedRow>(
      `SELECT id::text AS id, to_char(due_date, 'YYYY-MM-DD') AS due_date, name, category, amount::text AS amount, status, note,
              group_id::text AS group_id, seq, total
         FROM myfp.planned_expenses WHERE user_id = $1 ORDER BY due_date, created_at, id`,
      [userId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      dueDate: r.due_date,
      name: r.name,
      category: r.category,
      amount: Number(r.amount),
      status: r.status,
      note: r.note,
      groupId: r.group_id,
      seq: r.seq === null ? null : Number(r.seq),
      total: r.total === null ? null : Number(r.total),
    }));
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
}

/** 고정지출 기준 가장 이른 달: 시작일과 등록일(서울) 중 이른 값. 없으면 null */
export async function earliestFixedMonth(db: Db, userId: string): Promise<string | null> {
  const res = await db.query<{ month: string | null }>(
    `SELECT to_char(min(least(coalesce(start_date, (created_at AT TIME ZONE 'Asia/Seoul')::date), (created_at AT TIME ZONE 'Asia/Seoul')::date)), 'YYYY-MM') AS month
       FROM myfp.fixed_expenses WHERE user_id = $1`,
    [userId],
  );
  return res.rows[0]?.month ?? null;
}

export type PlannedWrite = { ok: true; count: number } | { ok: false; reason: "limit" | "not_found" };

/** 예정지출 추가 (count > 1 이면 같은 금액·같은 날짜로 매달, 한 묶음). 상한을 넘지 않게 사용자 행을 잠근 뒤 센다. 트랜잭션 안에서 부른다. */
export async function createPlanned(db: Db, userId: string, input: PlannedInput): Promise<PlannedWrite> {
  await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
  const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM myfp.planned_expenses WHERE user_id = $1", [userId]);
  if (Number(count.rows[0]?.n ?? 0) + input.count > LIMITS.plannedExpenses) return { ok: false, reason: "limit" };
  const groupId = input.count > 1 ? randomUUID() : null;
  const dates = installmentDates(input.dueDate, input.count);
  for (const [i, date] of dates.entries()) {
    await db.query(
      `INSERT INTO myfp.planned_expenses (user_id, due_date, name, category, amount, group_id, seq, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, date, input.name, input.category, input.amount, groupId, groupId ? i + 1 : null, groupId ? input.count : null],
    );
  }
  return { ok: true, count: dates.length };
}

/** 예정지출 수정. scope=group 이면 같은 묶음 전체의 이름·분류·금액을 바꾼다(날짜는 각자 유지). */
export async function updatePlanned(
  db: Db,
  userId: string,
  id: string,
  input: Omit<PlannedInput, "count">,
  scope: "one" | "group",
): Promise<PlannedWrite> {
  if (!isUuid(id)) return { ok: false, reason: "not_found" };
  const res =
    scope === "group"
      ? await db.query(
          `UPDATE myfp.planned_expenses SET name = $3, category = $4, amount = $5, updated_at = now()
            WHERE user_id = $1 AND group_id = (SELECT group_id FROM myfp.planned_expenses WHERE user_id = $1 AND id = $2 AND group_id IS NOT NULL)`,
          [userId, id, input.name, input.category, input.amount],
        )
      : await db.query(
          "UPDATE myfp.planned_expenses SET name = $3, category = $4, amount = $5, due_date = $6, updated_at = now() WHERE user_id = $1 AND id = $2",
          [userId, id, input.name, input.category, input.amount, input.dueDate],
        );
  const n = res.rowCount ?? 0;
  return n > 0 ? { ok: true, count: n } : { ok: false, reason: "not_found" };
}

export async function setPlannedStatus(db: Db, userId: string, id: string, status: PlannedStatus): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db.query("UPDATE myfp.planned_expenses SET status = $3, updated_at = now() WHERE user_id = $1 AND id = $2", [userId, id, status]);
  return (res.rowCount ?? 0) > 0;
}

/** 삭제한 건수. scope=group 이면 같은 묶음 전체 */
export async function deletePlanned(db: Db, userId: string, id: string, scope: "one" | "group"): Promise<number> {
  if (!isUuid(id)) return 0;
  const res =
    scope === "group"
      ? await db.query(
          `DELETE FROM myfp.planned_expenses
            WHERE user_id = $1 AND group_id = (SELECT group_id FROM myfp.planned_expenses WHERE user_id = $1 AND id = $2 AND group_id IS NOT NULL)`,
          [userId, id],
        )
      : await db.query("DELETE FROM myfp.planned_expenses WHERE user_id = $1 AND id = $2", [userId, id]);
  return res.rowCount ?? 0;
}

export type OverrideWrite = { ok: true } | { ok: false; reason: "not_found" | "limit" };

/** 고정지출 한 건의 그 달 덮어쓰기(금액 또는 건너뜀). 고정지출이 세션 사용자 것일 때만. 트랜잭션 안에서 부른다. */
export async function setOverride(
  db: Db,
  userId: string,
  fixedId: string,
  value: { month: string; amount: number | null; skipped: boolean },
): Promise<OverrideWrite> {
  if (!isUuid(fixedId)) return { ok: false, reason: "not_found" };
  const owned = await db.query("SELECT id FROM myfp.fixed_expenses WHERE user_id = $1 AND id = $2", [userId, fixedId]);
  if ((owned.rowCount ?? owned.rows.length) === 0) return { ok: false, reason: "not_found" };
  const existing = await db.query("SELECT 1 FROM myfp.fixed_overrides WHERE user_id = $1 AND fixed_expense_id = $2 AND month = $3", [userId, fixedId, value.month]);
  if (existing.rows.length === 0) {
    await db.query("SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE", [userId]);
    const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM myfp.fixed_overrides WHERE user_id = $1", [userId]);
    if (Number(count.rows[0]?.n ?? 0) >= LIMITS.fixedOverrides) return { ok: false, reason: "limit" };
  }
  await db.query(
    `INSERT INTO myfp.fixed_overrides (user_id, fixed_expense_id, month, amount, skipped) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fixed_expense_id, month) DO UPDATE SET amount = EXCLUDED.amount, skipped = EXCLUDED.skipped, updated_at = now()
     WHERE myfp.fixed_overrides.user_id = $1`,
    [userId, fixedId, value.month, value.amount, value.skipped],
  );
  return { ok: true };
}

/** 덮어쓰기 되돌리기(정의 그대로) */
export async function clearOverride(db: Db, userId: string, fixedId: string, month: string): Promise<boolean> {
  if (!isUuid(fixedId)) return false;
  const res = await db.query("DELETE FROM myfp.fixed_overrides WHERE user_id = $1 AND fixed_expense_id = $2 AND month = $3", [userId, fixedId, month]);
  return (res.rowCount ?? 0) > 0;
}
