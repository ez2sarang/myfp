// 인가 계약: 사용자 데이터 쿼리는 모두 세션 사용자 id 로 범위가 묶인다. 다른 사용자의 항목 id 를 넣어도 WHERE user_id 조건 때문에
// 읽기·수정·삭제가 일어나지 않는다(가짜 Db 가 "그 사용자의 행 없음"을 돌려주면 결과는 없음/실패).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createBalance, deleteBalance, getBalance, listBalances, listSnapshots, updateBalance } from "../src/lib/db/queries/balance.ts";
import { createFixed, deleteFixed, getFixed, listFixed, setFixedActive, setFixedArchived, updateFixed } from "../src/lib/db/queries/fixed.ts";
import { deleteAccount, deleteAllUserData } from "../src/lib/db/queries/account.ts";
import { createShareLink, listShareLinks, revokeShareLink } from "../src/lib/db/queries/share.ts";
import { CURRENT_PERIOD } from "../src/lib/share/options.ts";
import type { FixedInput, BalanceInput } from "../src/lib/finance/validate.ts";
import { fakeDb, type Call } from "./fake-db.ts";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ITEM = "bbbbbbbb-0000-4000-8000-000000000002";

const fixedInput: FixedInput = {
  name: "a",
  category: "other",
  amount: 1,
  cycle: "monthly",
  billingDay: 1,
  billingMonth: null,
  paymentMethod: null,
  institution: null,
  startDate: null,
  endDate: null,
  active: true,
  note: null,
  source: "manual",
};
const balanceInput: BalanceInput = { kind: "asset", category: "cash", name: "a", amount: 1, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null };

/** 사용자 데이터 테이블을 건드리는 쿼리는 user_id 조건을 갖고, 그 값은 세션 사용자 id 여야 한다. */
function assertScoped(calls: Call[], label: string) {
  const touching = calls.filter((c) => /myfp\.(fixed_expenses|balance_items|balance_snapshots|share_links)/.test(c.text));
  assert.ok(touching.length > 0, `${label}: 쿼리가 없음`);
  for (const c of touching) {
    if (c.text.startsWith("INSERT")) {
      assert.equal(c.params[0], ME, `${label}: INSERT 의 user_id 가 세션 사용자가 아님`);
      continue;
    }
    const m = /user_id = \$(\d+)/.exec(c.text);
    assert.ok(m, `${label}: user_id 조건 없음 — ${c.text}`);
    assert.equal(c.params[Number(m[1]) - 1], ME, `${label}: user_id 매개변수가 세션 사용자가 아님`);
  }
}

// 다른 사용자의 항목: 어떤 행도 일치하지 않는 DB
const noRows = () => ({ rows: [], rowCount: 0 });
const countZero = (c: Call) => (c.text.includes("count(*)") ? { rows: [{ n: "0" }] } : c.text.startsWith("INSERT") ? { rows: [{ id: OTHER_ITEM }] } : noRows());

test("고정지출: 목록·조회·수정·활성·보관·삭제 모두 세션 사용자로 범위가 묶이고, 남의 항목은 찾지 못한다", async () => {
  const f = fakeDb(noRows);
  assert.deepEqual(await listFixed(f.db, ME), []);
  assert.equal(await getFixed(f.db, ME, OTHER_ITEM), null);
  assert.deepEqual(await updateFixed(f.db, ME, OTHER_ITEM, fixedInput), { ok: false, reason: "not_found" });
  assert.equal(await setFixedActive(f.db, ME, OTHER_ITEM, false), false);
  assert.equal(await setFixedArchived(f.db, ME, OTHER_ITEM, true), false);
  assert.equal(await deleteFixed(f.db, ME, OTHER_ITEM), false);
  assertScoped(f.calls, "fixed");
  const c = fakeDb(countZero);
  assert.equal((await createFixed(c.db, ME, fixedInput)).ok, true);
  assertScoped(c.calls, "fixed.create");
});

test("자산·부채: 같은 범위 규칙", async () => {
  const f = fakeDb(noRows);
  assert.deepEqual(await listBalances(f.db, ME), []);
  assert.equal(await getBalance(f.db, ME, OTHER_ITEM), null);
  assert.deepEqual(await updateBalance(f.db, ME, OTHER_ITEM, balanceInput), { ok: false, reason: "not_found" });
  assert.equal(await deleteBalance(f.db, ME, OTHER_ITEM), false);
  assertScoped(f.calls, "balance");
  const c = fakeDb(countZero);
  assert.equal((await createBalance(c.db, ME, balanceInput)).ok, true);
  assertScoped(c.calls, "balance.create");
});

test("공유 링크 관리·전체 삭제: 같은 범위 규칙", async () => {
  const f = fakeDb(noRows);
  assert.deepEqual(await listShareLinks(f.db, ME), []);
  assert.equal(await revokeShareLink(f.db, ME, OTHER_ITEM), false);
  await deleteAllUserData(f.db, ME);
  assertScoped(f.calls, "share/account");
  const c = fakeDb(countZero);
  const created = await createShareLink(c.db, ME, { label: "x", scopes: ["fixed"], masks: { amounts: true, details: true }, expiresAt: null, period: CURRENT_PERIOD }, "a".repeat(64));
  assert.equal(created.ok, true);
  assertScoped(c.calls, "share.create");
});

test("uuid 가 아닌 id 는 DB 에 보내지도 않는다", async () => {
  const f = fakeDb(noRows);
  for (const bad of ["1 OR 1=1", "", "../x", "not-a-uuid"]) {
    assert.equal(await getFixed(f.db, ME, bad), null);
    assert.equal(await deleteBalance(f.db, ME, bad), false);
    assert.equal(await revokeShareLink(f.db, ME, bad), false);
  }
  assert.equal(f.calls.length, 0);
});

test("상한: 고정지출 300·자산부채 100·사용 중 공유 링크 10 에 도달하면 만들지 않는다", async () => {
  const full = (n: string) => fakeDb((c) => (c.text.includes("count(*)") ? { rows: [{ n }] } : { rows: [] }));
  const a = full("300");
  assert.deepEqual(await createFixed(a.db, ME, fixedInput), { ok: false, reason: "limit" });
  assert.equal(a.calls.some((c) => c.text.startsWith("INSERT")), false);
  const b = full("100");
  assert.deepEqual(await createBalance(b.db, ME, balanceInput), { ok: false, reason: "limit" });
  const s = full("10");
  assert.deepEqual(await createShareLink(s.db, ME, { label: "x", scopes: ["fixed"], masks: { amounts: true, details: true }, expiresAt: null, period: CURRENT_PERIOD }, "a".repeat(64)), {
    ok: false,
    reason: "limit",
  });
});

test("순자산 스냅샷: 자산·부채를 만들거나 바꾸면 같은 사용자 범위로 그 달 스냅샷을 갱신하고, 조회도 범위가 묶인다", async () => {
  const c = fakeDb((call) => (call.text.includes("count(*)") ? { rows: [{ n: "0" }] } : call.text.startsWith("INSERT INTO myfp.balance_items") ? { rows: [{ id: OTHER_ITEM }] } : { rows: [], rowCount: 1 }));
  await createBalance(c.db, ME, balanceInput);
  const snap = c.calls.find((x) => x.text.startsWith("INSERT INTO myfp.balance_snapshots"));
  assert.ok(snap, "스냅샷 갱신 쿼리");
  assert.match(snap.text, /FROM myfp\.balance_items WHERE user_id = \$1/);
  assert.equal(snap.params[0], ME);
  assert.match(String(snap.params[1]), /^\d{4}-\d{2}$/);
  assertScoped(c.calls, "balance.create+snapshot");
  const none = fakeDb(noRows);
  assert.equal(await deleteBalance(none.db, ME, OTHER_ITEM), false);
  assert.equal(none.calls.some((x) => x.text.includes("balance_snapshots")), false, "지운 행이 없으면 스냅샷도 건드리지 않는다");
  const l = fakeDb(noRows);
  assert.deepEqual(await listSnapshots(l.db, ME), []);
  assertScoped(l.calls, "snapshots.list");
});

test("자산·부채 수정·삭제도 시작할 때 같은 사용자 행을 잠근다 (create 와 같은 줄 세우기)", async () => {
  const u = fakeDb((call) => (call.text.startsWith("UPDATE myfp.balance_items") ? { rows: [{ id: OTHER_ITEM }] } : { rows: [], rowCount: 1 }));
  await updateBalance(u.db, ME, OTHER_ITEM, balanceInput);
  assert.match(u.calls[0]!.text, /^SELECT id FROM myfp\.users WHERE id = \$1 FOR UPDATE$/);
  assert.equal(u.calls[0]!.params[0], ME);
  const d = fakeDb(() => ({ rows: [], rowCount: 1 }));
  await deleteBalance(d.db, ME, OTHER_ITEM);
  assert.match(d.calls[0]!.text, /^SELECT id FROM myfp\.users WHERE id = \$1 FOR UPDATE$/);
});

test("계정 삭제: 세션 사용자 하나만 지운다(재무·스냅샷·공유·로그인 연결·사용자 행), 감사 기록에는 id 와 건수만", async () => {
  const f = fakeDb((c) => {
    if (c.text.includes("role = 'admin' AND status = 'active'")) return { rows: [{ id: "admin-1" }] };
    if (c.text.startsWith("SELECT role, status FROM myfp.users")) return { rows: [{ role: "member", status: "active" }] };
    return { rows: [], rowCount: 2 };
  });
  assert.deepEqual(await deleteAccount(f.db, ME), { ok: true });
  const deletes = f.calls.filter((c) => c.text.startsWith("DELETE"));
  assert.deepEqual(
    deletes.map((c) => c.text.replace(/ WHERE.*/, "")),
    ["DELETE FROM myfp.fixed_expenses", "DELETE FROM myfp.balance_items", "DELETE FROM myfp.share_links", "DELETE FROM myfp.balance_snapshots", "DELETE FROM myfp.accounts", "DELETE FROM myfp.users"],
  );
  for (const d of deletes) {
    assert.match(d.text, /WHERE (user_id|id) = \$1$/);
    assert.deepEqual(d.params, [ME], "다른 사용자 id 는 어떤 삭제에도 들어가지 않는다");
  }
  const audit = f.calls.find((c) => c.text.startsWith("INSERT INTO myfp.audit_log") && c.params[1] === "user.delete_self");
  assert.ok(audit);
  assert.equal(audit.params[0], null);
  assert.equal(audit.params[3], ME);
  assert.doesNotMatch(String(audit.params[5]), /@|name|email/);
});

test("계정 삭제: 마지막 활성 관리자는 거부하고 아무것도 지우지 않는다. 다른 관리자가 있으면 허용", async () => {
  const lastAdmin = fakeDb((c) => {
    if (c.text.includes("role = 'admin' AND status = 'active'")) return { rows: [{ id: ME }] };
    if (c.text.startsWith("SELECT role, status FROM myfp.users")) return { rows: [{ role: "admin", status: "active" }] };
    return { rows: [], rowCount: 1 };
  });
  assert.deepEqual(await deleteAccount(lastAdmin.db, ME), { ok: false, reason: "last_admin" });
  assert.equal(lastAdmin.calls.some((c) => c.text.startsWith("DELETE")), false);
  const twoAdmins = fakeDb((c) => {
    if (c.text.includes("role = 'admin' AND status = 'active'")) return { rows: [{ id: ME }, { id: "admin-2" }] };
    if (c.text.startsWith("SELECT role, status FROM myfp.users")) return { rows: [{ role: "admin", status: "active" }] };
    return { rows: [], rowCount: 1 };
  });
  assert.deepEqual(await deleteAccount(twoAdmins.db, ME), { ok: true });
  const gone = fakeDb((c) => (c.text.includes("role = 'admin'") ? { rows: [] } : { rows: [], rowCount: 0 }));
  assert.deepEqual(await deleteAccount(gone.db, ME), { ok: false, reason: "not_found" });
});

test("계정 삭제: 활성 관리자 조회가 FOR UPDATE 로 잠그고, 본인 조회·어떤 삭제보다 먼저 실행된다 (동시 자기 삭제로 관리자 0명 방지)", async () => {
  const f = fakeDb((c) => {
    if (c.text.includes("role = 'admin' AND status = 'active'")) return { rows: [{ id: "admin-1" }] };
    if (c.text.startsWith("SELECT role, status FROM myfp.users")) return { rows: [{ role: "member", status: "active" }] };
    return { rows: [], rowCount: 1 };
  });
  await deleteAccount(f.db, ME);
  const adminIdx = f.calls.findIndex((c) => c.text.includes("role = 'admin' AND status = 'active'"));
  const selfIdx = f.calls.findIndex((c) => c.text.startsWith("SELECT role, status FROM myfp.users"));
  const firstDelete = f.calls.findIndex((c) => c.text.startsWith("DELETE"));
  assert.equal(adminIdx, 0, "첫 쿼리가 관리자 잠금");
  assert.match(f.calls[adminIdx]!.text, /FOR UPDATE$/);
  assert.match(f.calls[selfIdx]!.text, /FOR UPDATE$/);
  assert.ok(adminIdx < selfIdx && selfIdx < firstDelete);
});
