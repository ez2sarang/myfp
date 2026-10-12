// 함께 보기(그룹): 접근 제어(visibleToViewer 한 곳·SQL 강제 조건·IDOR), 필드 최소화, 초대 단회·만료·동시 수락, 탈퇴·제거·방장 승계·계정 삭제,
// 구성원 선택 위·변조, 정렬·필터 순수 함수, 소스 계약.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { deleteAccount } from "../src/lib/db/queries/account.ts";
import { acceptInvite, createInvite, leaveHousehold, removeMember, visibleToViewer } from "../src/lib/db/queries/household.ts";
import {
  householdDetails,
  householdOccurrences,
  ownerSubtotals,
  parseHouseholdQuery,
  parseMemberSelection,
  pickSuccessor,
  validateHouseholdName,
  validateTag,
} from "../src/lib/household/rules.ts";
import { fakeDb, type Call } from "./fake-db.ts";
import { readCode, root, walk } from "./source-contract-helpers.ts";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";
const HH = "cccccccc-0000-4000-8000-000000000003";
const HASH = "a".repeat(64);
const SECRET_ITEM_ID = "dddddddd-0000-4000-8000-000000000004";

const memberRows = [
  { household_name: "가상 그룹", user_id: OTHER, role: "owner", tag: "가", share_fixed: true, share_balances: true, status: "active" },
  { household_name: "가상 그룹", user_id: ME, role: "member", tag: "나", share_fixed: true, share_balances: false, status: "active" },
];

function householdDb(over: (c: Call) => { rows?: unknown[]; rowCount?: number } | Error | undefined = () => undefined) {
  return fakeDb((c) => {
    const o = over(c);
    if (o !== undefined) return o as { rows?: Record<string, unknown>[] };
    if (c.text.includes("AS household_name")) return { rows: memberRows };
    if (c.text.includes("JOIN myfp.fixed_overrides")) return { rows: [{ fixed_expense_id: SECRET_ITEM_ID, month: "2026-10", amount: "7000", skipped: false }, { fixed_expense_id: "zzzz", month: "2026-10", amount: "1", skipped: false }] };
    if (c.text.includes("JOIN myfp.fixed_expenses f")) {
      return {
        rows: [
          { owner_id: OTHER, id: SECRET_ITEM_ID, name: "가 항목", category: "telecom", amount: "5000", cycle: "monthly", billing_day: 10, billing_month: null, start_date: null, end_date: null, active: true, archived: false },
          { owner_id: ME, id: "eeeeeeee-0000-4000-8000-000000000005", name: "나 항목", category: "housing", amount: "9000", cycle: "monthly", billing_day: 20, billing_month: null, start_date: null, end_date: null, active: true, archived: false },
        ],
      };
    }
    if (c.text.includes("JOIN myfp.balance_items b")) return { rows: [{ owner_id: OTHER, kind: "asset", category: "deposit", name: "가 예금", amount: "100", end_date: null }] };
    return { rows: [] };
  });
}

test("visibleToViewer: 모든 데이터 쿼리가 열람자 그룹 ↔ 활성 구성원 조인 + 내놓은 범위 + 나만 보기 제외를 SQL 로 강제하고, 입력은 세션 id 하나", async () => {
  const f = householdDb();
  const data = await visibleToViewer(f.db, ME);
  assert.ok(data);
  const dataQueries = f.calls.filter((c) => /JOIN myfp\.(fixed_expenses|balance_items|fixed_overrides)/.test(c.text));
  assert.equal(dataQueries.length, 3);
  for (const c of f.calls) assert.deepEqual(c.params, [ME], "열람자 id 외의 값은 쿼리에 들어가지 않는다");
  for (const c of dataQueries) {
    assert.match(c.text, /WHERE me\.user_id = \$1/);
    assert.match(c.text, /JOIN myfp\.users vu ON vu\.id = me\.user_id AND vu\.status = 'active'/);
    assert.match(c.text, /JOIN myfp\.household_members m ON m\.household_id = me\.household_id/);
    assert.match(c.text, /JOIN myfp\.users u ON u\.id = m\.user_id AND u\.status = 'active'/);
    assert.match(c.text, /private = false/);
    assert.match(c.text, /m\.share_(fixed|balances) = true/);
    assert.doesNotMatch(c.text, /\b(note|institution|payment_method|source|monthly_payment|interest_rate|as_of|token_hash|email)\b/, "보이면 안 되는 열을 조회하지 않는다");
  }
});

test("visibleToViewer 결과: 사용자 id·실제 항목 id·메모 등 없음, 구성원은 가입 순 키(m1…), 덮어쓰기는 불투명 id 로 연결", async () => {
  const data = await visibleToViewer(householdDb().db, ME);
  const json = JSON.stringify(data);
  for (const secret of [ME, OTHER, SECRET_ITEM_ID, HH]) assert.equal(json.includes(secret), false, secret);
  for (const key of ['"note"', '"institution"', '"paymentMethod"', '"source"', '"email"', '"userId"']) assert.equal(json.includes(key), false, key);
  assert.deepEqual(data?.members.map((m) => [m.key, m.tag, m.isSelf]), [
    ["m1", "가", false],
    ["m2", "나", true],
  ]);
  assert.deepEqual(data?.fixed.map((x) => [x.id, x.ownerKey]), [
    ["m1-1", "m1"],
    ["m2-1", "m2"],
  ]);
  assert.deepEqual(data?.overrides, [{ fixedExpenseId: "m1-1", month: "2026-10", amount: 7000, skipped: false }], "모르는 항목의 덮어쓰기는 버린다");
});

test("visibleToViewer: 그룹이 없으면 null 이고 데이터 쿼리를 하지 않는다. id 형식이 아니면 쿼리도 없다. 0008 전이면 null", async () => {
  const none = householdDb((c) => (c.text.includes("AS household_name") ? { rows: [] } : undefined));
  assert.equal(await visibleToViewer(none.db, ME), null);
  assert.equal(none.calls.length, 1);
  const bad = householdDb();
  assert.equal(await visibleToViewer(bad.db, "1 OR 1=1"), null);
  assert.equal(bad.calls.length, 0);
  const missing = householdDb(() => Object.assign(new Error("no table"), { code: "42P01" }));
  assert.equal(await visibleToViewer(missing.db, ME), null);
});

function acceptDb(state: { member?: boolean; invite?: boolean; count?: number; tag?: boolean; consumed?: number }) {
  return fakeDb((c) => {
    if (c.text.startsWith("SELECT 1 FROM myfp.household_members WHERE user_id")) return { rows: state.member ? [{}] : [] };
    if (c.text.startsWith("SELECT household_id::text AS household_id FROM myfp.household_invites")) return { rows: state.invite === false ? [] : [{ household_id: HH }] };
    if (c.text.startsWith("SELECT count(*)::text AS n FROM myfp.household_members")) return { rows: [{ n: String(state.count ?? 1) }] };
    if (c.text.startsWith("SELECT 1 FROM myfp.household_members WHERE household_id")) return { rows: state.tag ? [{}] : [] };
    if (c.text.startsWith("UPDATE myfp.household_invites")) return { rows: [], rowCount: state.consumed ?? 1 };
    return { rows: [], rowCount: 1 };
  });
}

const INPUT = { tag: "다", shareFixed: true, shareBalances: false };
const wrote = (calls: Call[]) => calls.some((c) => c.text.startsWith("UPDATE myfp.household_invites") || c.text.startsWith("INSERT INTO myfp.household_members"));

test("초대 수락: 정상 순서(사용자 잠금 → 소속 확인 → 초대 → 그룹 잠금 → 인원·태그 → 단회 소비 → 가입 → 감사)", async () => {
  const f = acceptDb({});
  assert.deepEqual(await acceptInvite(f.db, ME, HASH, INPUT), { ok: true });
  const order = [
    "SELECT id FROM myfp.users WHERE id = $1 FOR UPDATE",
    "SELECT 1 FROM myfp.household_members WHERE user_id",
    "SELECT household_id::text AS household_id FROM myfp.household_invites",
    "SELECT id FROM myfp.households WHERE id = $1 FOR UPDATE",
    "SELECT count(*)::text AS n FROM myfp.household_members",
    "SELECT 1 FROM myfp.household_members WHERE household_id",
    "UPDATE myfp.household_invites SET used_at = now(), used_by = $2",
    "INSERT INTO myfp.household_members",
    "INSERT INTO myfp.audit_log",
  ];
  assert.deepEqual(
    f.calls.map((c) => order.find((o) => c.text.startsWith(o)) ?? c.text),
    order,
  );
  const consume = f.calls.find((c) => c.text.startsWith("UPDATE myfp.household_invites"))!;
  assert.match(consume.text, /used_at IS NULL AND expires_at > now\(\)/, "단회·만료 조건부 소비");
  const insert = f.calls.find((c) => c.text.startsWith("INSERT INTO myfp.household_members"))!;
  assert.deepEqual(insert.params, [HH, ME, "다", true, false], "그룹 id 는 초대에서, 사용자 id 는 세션에서");
  const audit = f.calls.find((c) => c.text.startsWith("INSERT INTO myfp.audit_log"))!;
  assert.doesNotMatch(JSON.stringify(audit.params), /"다"/, "감사 기록에 태그(이름) 없음");
});

test("초대 수락 거부: 이미 소속·없음/사용됨/만료·인원 초과·태그 중복·동시 수락에서 진 쪽 — 모두 가입하지 않는다", async () => {
  const cases: [Parameters<typeof acceptDb>[0], string][] = [
    [{ member: true }, "already_member"],
    [{ invite: false }, "not_found"],
    [{ count: 6 }, "full"],
    [{ tag: true }, "tag_taken"],
    [{ consumed: 0 }, "not_found"],
  ];
  for (const [state, reason] of cases) {
    const f = acceptDb(state);
    assert.deepEqual(await acceptInvite(f.db, ME, HASH, INPUT), { ok: false, reason }, reason);
    assert.equal(f.calls.some((c) => c.text.startsWith("INSERT INTO myfp.household_members")), false, `${reason}: 가입 없음`);
    if (reason !== "not_found" || state.consumed === undefined) {
      assert.equal(f.calls.some((c) => c.text.startsWith("UPDATE myfp.household_invites")), false, `${reason}: 초대 소비 없음`);
    }
  }
  const malformed = acceptDb({});
  assert.deepEqual(await acceptInvite(malformed.db, ME, "not-a-hash", INPUT), { ok: false, reason: "not_found" });
  assert.equal(malformed.calls.length, 0);
  assert.equal(wrote(malformed.calls), false);
});

test("초대 만들기: 방장만, 인원 6명이면 거부, 사용 중 초대 5개면 거부, 저장은 해시만", async () => {
  const notOwner = fakeDb(() => ({ rows: [] }));
  assert.deepEqual(await createInvite(notOwner.db, ME, HASH), { ok: false, reason: "not_owner" });
  assert.equal(notOwner.calls.some((c) => c.text.startsWith("INSERT")), false);
  const make = (members: number, invites: number) =>
    fakeDb((c) => {
      if (c.text.includes("role = 'owner'")) return { rows: [{ household_id: HH }] };
      if (c.text.includes("FROM myfp.household_members WHERE household_id")) return { rows: [{ n: String(members) }] };
      if (c.text.includes("FROM myfp.household_invites WHERE household_id")) return { rows: [{ n: String(invites) }] };
      return { rows: [{ id: "x" }], rowCount: 1 };
    });
  assert.deepEqual(await createInvite(make(6, 0).db, ME, HASH), { ok: false, reason: "full" });
  assert.deepEqual(await createInvite(make(2, 5).db, ME, HASH), { ok: false, reason: "limit" });
  const ok = make(2, 4);
  assert.deepEqual(await createInvite(ok.db, ME, HASH), { ok: true });
  const insert = ok.calls.find((c) => c.text.startsWith("INSERT INTO myfp.household_invites"))!;
  assert.deepEqual(insert.params, [HH, HASH, ME, 7]);
});

test("내보내기: 방장의 그룹 안에서 태그로만 찾고, 자기 자신은 거부, 방장이 아니면 아무것도 지우지 않는다", async () => {
  const notOwner = fakeDb(() => ({ rows: [] }));
  assert.deepEqual(await removeMember(notOwner.db, ME, "가"), { ok: false, reason: "not_owner" });
  assert.equal(notOwner.calls.some((c) => c.text.startsWith("DELETE")), false);
  const owner = (targetId: string) =>
    fakeDb((c) => {
      if (c.text.includes("role = 'owner'")) return { rows: [{ household_id: HH }] };
      if (c.text.startsWith("SELECT user_id::text AS user_id FROM myfp.household_members WHERE household_id")) return { rows: [{ user_id: targetId }] };
      return { rows: [], rowCount: 1 };
    });
  assert.deepEqual(await removeMember(owner(ME).db, ME, "나"), { ok: false, reason: "self" });
  const f = owner(OTHER);
  assert.deepEqual(await removeMember(f.db, ME, "가"), { ok: true });
  const lookup = f.calls.find((c) => c.text.startsWith("SELECT user_id::text"))!;
  assert.deepEqual(lookup.params, [HH, "가"], "다른 그룹의 태그는 찾을 수 없다(방장 그룹 id 로 묶임)");
  const del = f.calls.find((c) => c.text.startsWith("DELETE FROM myfp.household_members"))!;
  assert.deepEqual(del.params, [HH, OTHER]);
  assert.match(del.text, /role = 'member'/);
});

function leaveDb(role: "owner" | "member", rest: { user_id: string; role: string; joined_at: Date }[]) {
  return fakeDb((c) => {
    if (c.text.startsWith("SELECT household_id::text AS household_id, role FROM myfp.household_members WHERE user_id")) return { rows: [{ household_id: HH, role }] };
    if (c.text.startsWith("SELECT user_id::text AS user_id, role, joined_at")) return { rows: rest };
    if (c.text.includes("to_regclass('myfp.household_members')")) return { rows: [{ present: true }] };
    if (c.text.startsWith("SELECT role, status FROM myfp.users")) return { rows: [{ role: "member", status: "active" }] };
    return { rows: [], rowCount: 1 };
  });
}

test("나가기: 방장이면 가장 먼저 가입한 구성원에게 승계, 혼자면 그룹 삭제, 구성원은 자기 행만 삭제", async () => {
  const early = new Date("2026-01-01T00:00:00Z");
  const late = new Date("2026-05-01T00:00:00Z");
  const withOthers = leaveDb("owner", [
    { user_id: "ffffffff-0000-4000-8000-000000000006", role: "member", joined_at: late },
    { user_id: OTHER, role: "member", joined_at: early },
  ]);
  assert.deepEqual(await leaveHousehold(withOthers.db, ME), { ok: true });
  const promote = withOthers.calls.find((c) => c.text.startsWith("UPDATE myfp.household_members SET role = 'owner'"))!;
  assert.deepEqual(promote.params, [HH, OTHER]);
  const delIdx = withOthers.calls.findIndex((c) => c.text.startsWith("DELETE FROM myfp.household_members"));
  assert.ok(delIdx >= 0 && delIdx < withOthers.calls.indexOf(promote), "내 행을 먼저 지우고 승계(방장 1명 유일 인덱스)");
  assert.equal(withOthers.calls.some((c) => c.text.startsWith("DELETE FROM myfp.households")), false);

  const alone = leaveDb("owner", []);
  await leaveHousehold(alone.db, ME);
  assert.ok(alone.calls.some((c) => c.text === "DELETE FROM myfp.households WHERE id = $1" && c.params[0] === HH));

  const member = leaveDb("member", []);
  await leaveHousehold(member.db, ME);
  assert.equal(member.calls.some((c) => c.text.startsWith("UPDATE myfp.household_members") || c.text.startsWith("DELETE FROM myfp.households")), false);
  assert.deepEqual(member.calls.find((c) => c.text.startsWith("DELETE FROM myfp.household_members"))!.params, [HH, ME]);
});

test("계정 삭제: 그룹 테이블이 있으면 같은 트랜잭션에서 먼저 그룹을 나가고(승계·삭제), 마지막에 사용자 행을 지운다", async () => {
  const f = leaveDb("owner", [{ user_id: OTHER, role: "member", joined_at: new Date("2026-01-01T00:00:00Z") }]);
  assert.deepEqual(await deleteAccount(f.db, ME), { ok: true });
  const texts = f.calls.map((c) => c.text);
  const promote = texts.findIndex((t) => t.startsWith("UPDATE myfp.household_members SET role = 'owner'"));
  const userDelete = texts.indexOf("DELETE FROM myfp.users WHERE id = $1");
  assert.ok(promote >= 0 && userDelete > promote, "승계 → 사용자 삭제 순서");
  const noTables = fakeDb((c) => (c.text.startsWith("SELECT role, status FROM myfp.users") ? { rows: [{ role: "member", status: "active" }] } : { rows: [], rowCount: 1 }));
  assert.deepEqual(await deleteAccount(noTables.db, ME), { ok: true });
  assert.equal(noTables.calls.some((c) => c.text.includes("household_members WHERE user_id")), false, "0008 전에는 그룹 처리 없음");
});

test("방장 승계 순수 함수: 가입 순, 같으면 id 순, 남는 사람 없으면 null", () => {
  const t = new Date("2026-01-01T00:00:00Z");
  assert.equal(pickSuccessor([{ userId: "b", role: "member", joinedAt: t }, { userId: "a", role: "member", joinedAt: t }, { userId: "me", role: "owner", joinedAt: new Date(0) }], "me"), "a");
  assert.equal(pickSuccessor([{ userId: "me", role: "owner", joinedAt: t }], "me"), null);
});

test("구성원 선택 위·변조: 내 그룹 키와 교집합만, 모르는 값·다른 그룹 키·빈 값은 무시(교집합이 비면 전체)", () => {
  const keys = ["m1", "m2", "m3"];
  assert.deepEqual(parseMemberSelection(["m2", "m9", "' OR 1=1"], keys), ["m2"]);
  assert.deepEqual(parseMemberSelection("m3,m1", keys), ["m1", "m3"]);
  assert.deepEqual(parseMemberSelection(["x", "y"], keys), keys);
  assert.deepEqual(parseMemberSelection(undefined, keys), keys);
  const q = parseHouseholdQuery({ sort: "owner", dir: "desc", cat: "nope", owner: "m9" }, ["m1", "m2"]);
  assert.deepEqual(q, { sort: "owner", dir: "desc", cat: null, owner: null });
  assert.deepEqual(parseHouseholdQuery({ sort: "drop table", owner: "m2" }, ["m1", "m2"]), { sort: "amount", dir: "desc", cat: null, owner: "m2" });
});

test("합산 순수 함수: 선택한 구성원만 계산, 소유자순·필터·소계", () => {
  const base = { cycle: "monthly" as const, billingMonth: null, startDate: null, endDate: null, active: true, archived: false };
  const fixed = [
    { ...base, id: "m1-1", ownerKey: "m1", name: "가", category: "telecom" as const, amount: 3000, billingDay: 5 },
    { ...base, id: "m2-1", ownerKey: "m2", name: "나", category: "housing" as const, amount: 9000, billingDay: 20 },
    { ...base, id: "m3-1", ownerKey: "m3", name: "다", category: "tax" as const, amount: 1000, billingDay: 1 },
  ];
  const members = [
    { key: "m1", tag: "가" },
    { key: "m2", tag: "나" },
    { key: "m3", tag: "다" },
  ];
  const rows = householdOccurrences(fixed, [{ fixedExpenseId: "m2-1", month: "2026-11", amount: 4000, skipped: false }], members, ["m1", "m2"], "2026-11", "2026-10-12");
  assert.deepEqual(rows.map((r) => [r.ownerTag, r.amount]), [["가", 3000], ["나", 4000]], "선택 밖 구성원(m3) 없음, 덮어쓰기 반영");
  const d = householdDetails(rows, { sort: "owner", dir: "desc", cat: null, owner: null });
  assert.deepEqual(d.rows.map((r) => r.ownerKey), ["m2", "m1"]);
  assert.deepEqual(householdDetails(rows, { sort: "amount", dir: "desc", cat: null, owner: "m1" }).rows.map((r) => r.id), ["m1-1"]);
  assert.deepEqual(ownerSubtotals(rows, members.slice(0, 2)), [
    { key: "m1", tag: "가", count: 1, total: 3000 },
    { key: "m2", tag: "나", count: 1, total: 4000 },
  ]);
});

test("이름·태그 검증: 1~30/1~12자, 줄바꿈·제어·양방향 서식 문자 거부", () => {
  assert.deepEqual(validateHouseholdName(" 우리 집 "), { ok: true, value: "우리 집" });
  assert.equal(validateHouseholdName("가".repeat(31)).ok, false);
  assert.equal(validateTag("가".repeat(12)).ok, true);
  assert.equal(validateTag("가".repeat(13)).ok, false);
  for (const bad of ["", "  ", "가\n나", "가\u202e나", 3]) assert.equal(validateTag(bad).ok, false, JSON.stringify(bad));
});

test("소스 계약: 다른 사용자 데이터를 그룹으로 읽는 SQL 은 household.ts(visibleToViewer) 에만, 공유 보기·관리자는 그룹을 모른다", () => {
  const files = walk(path.join(root, "src"))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => path.relative(root, f).split(path.sep).join("/"));
  // 테이블 존재 확인(to_regclass)만 하는 곳은 제외하고, 그룹 테이블을 실제로 조회·변경하는 파일
  const sqlUsers = files.filter((f) => /myfp\.household_members/.test(readFileSync(path.join(root, f), "utf8").replace(/to_regclass\('[^']*'\)/g, "")));
  assert.deepEqual(sqlUsers, ["src/lib/db/queries/household.ts"]);
  const code = readCode("src/lib/db/queries/household.ts");
  // 재무 테이블(고정지출·자산·덮어쓰기)을 읽는 쿼리는 visibleToViewer 함수 안에만 있다
  const start = code.indexOf("export async function visibleToViewer");
  const end = code.indexOf("export type HouseholdWrite");
  const outside = code.slice(0, start) + code.slice(end);
  assert.doesNotMatch(outside, /myfp\.(fixed_expenses|balance_items|fixed_overrides|planned_expenses)/);
  for (const f of files) {
    if (f.startsWith("src/lib/share/") || f.startsWith("src/app/s/") || f.startsWith("src/components/share/") || f.startsWith("src/app/admin/")) {
      assert.doesNotMatch(readFileSync(path.join(root, f), "utf8"), /household|visibleToViewer/i, f);
    }
  }
  // 그룹 화면은 그룹 데이터를 visibleToViewer 로만 읽는다 (다른 저장소 함수로 남의 데이터를 읽지 않는다)
  for (const page of ["src/app/app/household/page.tsx", "src/app/app/household/settings/page.tsx"]) {
    const p = readCode(page);
    assert.doesNotMatch(p, /listFixed|listBalances|listOverrides|listPlanned/, page);
  }
  const join = readCode("src/app/join/[token]/page.tsx");
  assert.ok(join.indexOf("await requireActiveUser(") < join.indexOf("findInvite("), "초대 조회 전에 로그인·활성 확인");
  assert.match(join, /if \(!invite\) notFound\(\);/);
  const actions = readCode("src/lib/actions/household.ts");
  assert.doesNotMatch(actions, /formData\.get\("(user_?[iI]d|household_?[iI]d)"\)/, "폼의 사용자 id·그룹 id 를 읽지 않는다");
});

test("나만 보기: private 열(0008)이 있을 때만 세션 사용자 행에 저장하고, 없으면 건너뛴다. 읽기는 0008 전에도 false", async () => {
  const { createFixed } = await import("../src/lib/db/queries/fixed.ts");
  const input = { name: "a", category: "other" as const, amount: 1, cycle: "monthly" as const, billingDay: 1, billingMonth: null, paymentMethod: null, institution: null, startDate: null, endDate: null, active: true, note: null, source: "manual" as const, private: true };
  const respond = (hasCol: boolean) => (c: Call) =>
    c.text.startsWith("SELECT 1 FROM information_schema.columns")
      ? { rows: hasCol ? [{}] : [] }
      : c.text.startsWith("SELECT count")
        ? { rows: [{ n: "0" }] }
        : c.text.startsWith("INSERT")
          ? { rows: [{ id: SECRET_ITEM_ID }] }
          : { rows: [], rowCount: 1 };
  const before = fakeDb(respond(false));
  await createFixed(before.db, ME, input);
  assert.equal(before.calls.some((c) => c.text.includes("SET private")), false);
  const after = fakeDb(respond(true));
  await createFixed(after.db, ME, input);
  const set = after.calls.find((c) => c.text.includes("SET private"))!;
  assert.equal(set.text, "UPDATE myfp.fixed_expenses SET private = $3 WHERE user_id = $1 AND id = $2");
  assert.deepEqual(set.params, [ME, SECRET_ITEM_ID, true]);
  assert.match(readCode("src/lib/db/queries/fixed.ts"), /COALESCE\(\(to_jsonb\(fixed_expenses\) ->> 'private'\)::boolean, false\) AS private/);
  assert.match(readCode("src/lib/db/queries/balance.ts"), /COALESCE\(\(to_jsonb\(balance_items\) ->> 'private'\)::boolean, false\) AS private/);
});
