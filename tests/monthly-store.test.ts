// 월 단위 저장소·검증: 모든 쿼리가 세션 사용자 id 로 묶임(IDOR), 덮어쓰기는 본인 고정지출에만, 상한, 분할 묶음, 입력 범위, 0006 전 호환.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteAllUserData } from "../src/lib/db/queries/account.ts";
import { clearOverride, createPlanned, deletePlanned, listOverrides, listPlanned, setOverride, setPlannedStatus, updatePlanned } from "../src/lib/db/queries/monthly.ts";
import { monthInEditableRange, parseOverrideInput, parsePlannedInput, parsePlannedStatus } from "../src/lib/finance/monthly-validate.ts";
import { fakeDb, type Call } from "./fake-db.ts";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const ITEM = "bbbbbbbb-0000-4000-8000-000000000002";
const TODAY = "2026-10-12";
const INPUT = { name: "가상 예정", category: "tax" as const, amount: 10_000, dueDate: "2026-11-30", count: 1 };

/** 월 단위 테이블을 건드리는 쿼리는 user_id = $1 이고 $1 은 세션 사용자 */
function assertScoped(calls: Call[]) {
  const touching = calls.filter((c) => /myfp\.(planned_expenses|fixed_overrides|fixed_expenses)/.test(c.text) && !c.text.includes("to_regclass"));
  assert.ok(touching.length > 0);
  for (const c of touching) {
    assert.equal(c.params[0], ME, c.text);
    if (!c.text.startsWith("INSERT")) assert.match(c.text, /user_id = \$1/, c.text);
  }
}

test("예정지출 추가: 사용자 행을 잠그고 상한(600)을 센 뒤, 분할이면 한 묶음으로 매달 넣는다", async () => {
  const f = fakeDb((c) => (c.text.startsWith("SELECT count") ? { rows: [{ n: "590" }] } : { rows: [], rowCount: 1 }));
  assert.deepEqual(await createPlanned(f.db, ME, { ...INPUT, count: 3 }), { ok: true, count: 3 });
  assert.equal(f.calls[0]!.text, "SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE");
  const inserts = f.calls.filter((c) => c.text.startsWith("INSERT INTO myfp.planned_expenses"));
  assert.deepEqual(inserts.map((c) => c.params[1]), ["2026-11-30", "2026-12-30", "2027-01-30"]);
  assert.ok(inserts.every((c) => c.params[0] === ME && c.params[5] === inserts[0]!.params[5] && c.params[7] === 3));
  assert.deepEqual(inserts.map((c) => c.params[6]), [1, 2, 3]);
  const full = fakeDb((c) => (c.text.startsWith("SELECT count") ? { rows: [{ n: "598" }] } : { rows: [], rowCount: 1 }));
  assert.deepEqual(await createPlanned(full.db, ME, { ...INPUT, count: 3 }), { ok: false, reason: "limit" });
  assert.equal(full.calls.some((c) => c.text.startsWith("INSERT")), false);
  const single = fakeDb((c) => (c.text.startsWith("SELECT count") ? { rows: [{ n: "0" }] } : { rows: [], rowCount: 1 }));
  await createPlanned(single.db, ME, INPUT);
  const one = single.calls.find((c) => c.text.startsWith("INSERT"))!;
  assert.deepEqual(one.params.slice(5), [null, null, null], "한 번짜리는 묶음 없음");
});

test("예정지출 수정·상태·삭제: 항목·묶음 모두 세션 사용자 범위, 다른 사용자 항목이면 바뀌는 행이 없어 실패", async () => {
  const none = fakeDb(() => ({ rows: [], rowCount: 0 }));
  assert.deepEqual(await updatePlanned(none.db, ME, ITEM, INPUT, "one"), { ok: false, reason: "not_found" });
  assert.deepEqual(await updatePlanned(none.db, ME, ITEM, INPUT, "group"), { ok: false, reason: "not_found" });
  assert.equal(await setPlannedStatus(none.db, ME, ITEM, "paid"), false);
  assert.equal(await deletePlanned(none.db, ME, ITEM, "one"), 0);
  assert.equal(await deletePlanned(none.db, ME, ITEM, "group"), 0);
  assertScoped(none.calls);
  for (const c of none.calls.filter((x) => x.text.includes("group_id = (SELECT"))) {
    assert.match(c.text, /WHERE user_id = \$1 AND group_id = \(SELECT group_id FROM myfp\.planned_expenses WHERE user_id = \$1 AND id = \$2/, "묶음 찾기도 본인 범위");
  }
  const bad = fakeDb();
  assert.deepEqual(await updatePlanned(bad.db, ME, "1 OR 1=1", INPUT, "one"), { ok: false, reason: "not_found" });
  assert.equal(await deletePlanned(bad.db, ME, "x", "group"), 0);
  assert.equal(bad.calls.length, 0, "id 형식이 아니면 쿼리하지 않는다");
});

test("덮어쓰기: 본인 고정지출이 아니면 아무것도 쓰지 않고, 새로 만들 때만 상한(600)을 센다", async () => {
  const notMine = fakeDb(() => ({ rows: [], rowCount: 0 }));
  assert.deepEqual(await setOverride(notMine.db, ME, ITEM, { month: "2026-11", amount: 1, skipped: false }), { ok: false, reason: "not_found" });
  assert.equal(notMine.calls.length, 1);
  assert.equal(notMine.calls[0]!.text, "SELECT id FROM myfp.fixed_expenses WHERE user_id = $1 AND id = $2");

  const fresh = fakeDb((c) => {
    if (c.text.startsWith("SELECT id FROM myfp.fixed_expenses")) return { rows: [{ id: ITEM }], rowCount: 1 };
    if (c.text.startsWith("SELECT count")) return { rows: [{ n: "10" }] };
    return { rows: [], rowCount: 1 };
  });
  assert.deepEqual(await setOverride(fresh.db, ME, ITEM, { month: "2026-11", amount: null, skipped: true }), { ok: true });
  const upsert = fresh.calls.at(-1)!;
  assert.match(upsert.text, /ON CONFLICT \(fixed_expense_id, month\) DO UPDATE .* WHERE myfp\.fixed_overrides\.user_id = \$1$/);
  assert.deepEqual(upsert.params, [ME, ITEM, "2026-11", null, true]);
  assertScoped(fresh.calls);

  const full = fakeDb((c) => {
    if (c.text.startsWith("SELECT id FROM myfp.fixed_expenses")) return { rows: [{ id: ITEM }], rowCount: 1 };
    if (c.text.startsWith("SELECT count")) return { rows: [{ n: "600" }] };
    return { rows: [], rowCount: 0 };
  });
  assert.deepEqual(await setOverride(full.db, ME, ITEM, { month: "2026-11", amount: 5, skipped: false }), { ok: false, reason: "limit" });
  const existing = fakeDb((c) => {
    if (c.text.startsWith("SELECT id FROM myfp.fixed_expenses")) return { rows: [{ id: ITEM }], rowCount: 1 };
    if (c.text.startsWith("SELECT 1 FROM myfp.fixed_overrides")) return { rows: [{ "?column?": 1 }] };
    if (c.text.startsWith("SELECT count")) return { rows: [{ n: "600" }] };
    return { rows: [], rowCount: 1 };
  });
  assert.deepEqual(await setOverride(existing.db, ME, ITEM, { month: "2026-11", amount: 5, skipped: false }), { ok: true }, "이미 있는 덮어쓰기 수정은 상한과 무관");

  const clear = fakeDb(() => ({ rows: [], rowCount: 1 }));
  assert.equal(await clearOverride(clear.db, ME, ITEM, "2026-11"), true);
  assert.deepEqual(clear.calls[0]!.params, [ME, ITEM, "2026-11"]);
  assertScoped(clear.calls);
});

test("0006 적용 전: 목록 읽기는 빈 목록(42P01), 다른 오류는 그대로 던진다", async () => {
  const missing = fakeDb(() => Object.assign(new Error("relation does not exist"), { code: "42P01" }));
  assert.deepEqual(await listPlanned(missing.db, ME), []);
  assert.deepEqual(await listOverrides(missing.db, ME), []);
  const other = fakeDb(() => Object.assign(new Error("denied"), { code: "42501" }));
  await assert.rejects(listPlanned(other.db, ME));
});

test("내 데이터 전체 삭제: 0006 테이블이 있으면 덮어쓰기·예정지출도 본인 것만 지운다", async () => {
  const f = fakeDb((c) => (c.text.includes("to_regclass") ? { rows: [{ overrides: true, planned: true }] } : { rows: [], rowCount: 1 }));
  await deleteAllUserData(f.db, ME);
  const deletes = f.calls.filter((c) => c.text.startsWith("DELETE")).map((c) => c.text.replace(/ WHERE.*/, ""));
  assert.deepEqual(deletes.slice(0, 3), ["DELETE FROM myfp.fixed_overrides", "DELETE FROM myfp.planned_expenses", "DELETE FROM myfp.fixed_expenses"]);
  for (const c of f.calls.filter((x) => x.text.startsWith("DELETE"))) assert.deepEqual(c.params, [ME]);
});

test("입력 검증: 예정지출(이름·분류·금액·날짜 범위·분할 1~36)과 상태·덮어쓰기", () => {
  const ok = parsePlannedInput({ name: " 가상 ", category: "tax", amount: "1,000", dueDate: "2026-12-31", count: "36" }, TODAY, { allowCount: true });
  assert.deepEqual(ok, { ok: true, value: { name: "가상", category: "tax", amount: 1000, dueDate: "2026-12-31", count: 36 } });
  const bad = parsePlannedInput({ name: "", category: "x", amount: "-1", dueDate: "2027-11-01", count: "37" }, TODAY, { allowCount: true });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.ok ? {} : bad.errors).sort(), ["amount", "category", "count", "dueDate", "name"]);
  assert.equal(parsePlannedInput({ ...{ name: "a", category: "tax", amount: "1", dueDate: "2026-02-30" } }, TODAY, { allowCount: false }).ok, false, "없는 날짜");
  assert.equal(parsePlannedInput({ name: "a", category: "tax", amount: "1", dueDate: "2016-09-30" }, TODAY, { allowCount: false }).ok, false, "120개월보다 과거");
  assert.equal(parsePlannedInput({ name: "a", category: "tax", amount: "1", dueDate: "2016-10-01", count: "99" }, TODAY, { allowCount: false }).ok, true, "수정에서는 분할 횟수를 읽지 않는다");
  assert.equal(parsePlannedStatus("paid"), "paid");
  assert.equal(parsePlannedStatus("deleted"), null);
  assert.deepEqual(parseOverrideInput({ month: "2026-11", mode: "amount", amount: "12,000" }, TODAY), { ok: true, value: { month: "2026-11", amount: 12000, skipped: false } });
  assert.deepEqual(parseOverrideInput({ month: "2026-11", mode: "skip", amount: "abc" }, TODAY), { ok: true, value: { month: "2026-11", amount: null, skipped: true } });
  for (const bad2 of [{ month: "2027-11", mode: "skip" }, { month: "2026-11", mode: "amount", amount: "" }, { month: "2026-11", mode: "delete" }, { month: "26-11", mode: "skip" }]) {
    assert.equal(parseOverrideInput(bad2, TODAY).ok, false, JSON.stringify(bad2));
  }
  assert.equal(monthInEditableRange("2027-10", TODAY), true);
  assert.equal(monthInEditableRange("2027-11", TODAY), false);
  assert.equal(monthInEditableRange("2016-10", TODAY), true);
  assert.equal(monthInEditableRange("2016-09", TODAY), false);
});
