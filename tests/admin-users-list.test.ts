// 관리자 사용자 목록: 한 번의 쿼리로 등록 항목 수만 센다(금액·이름·메모 미조회), 가입일 내림차순·페이지, 이름 없는 사용자 구분 라벨, 관리자 가드.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { ADMIN_PAGE_SIZE, formatSeoulDateTime, parsePage, providerLabel, shortUserId, userPrimaryLabel } from "../src/lib/admin/user-label.ts";
import { listUsers } from "../src/lib/db/queries/users.ts";
import { fakeDb } from "./fake-db.ts";
import { guardsBeforeFirstReturn, readCode, root, walk } from "./source-contract-helpers.ts";

const ROW = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  email: null,
  name: null,
  display_name: null,
  status: "active",
  role: "member",
  created_at: new Date("2026-10-12T05:00:00Z"),
  last_login_at: null,
  providers: ["kakao"],
  fixed_count: 3,
  balance_count: 2,
  share_count: 1,
};

test("목록은 쿼리 한 번(사용자마다 따로 묻지 않음), 가입일 내림차순, LIMIT/OFFSET 페이지", async () => {
  const f = fakeDb(() => ({ rows: [ROW, { ...ROW, id: "bbbbbbbb-0000-4000-8000-000000000002" }] }));
  const rows = await listUsers(f.db, { limit: ADMIN_PAGE_SIZE, offset: ADMIN_PAGE_SIZE });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0]!.params, [50, 50]);
  assert.match(f.calls[0]!.text, /ORDER BY u\.created_at DESC, u\.id DESC LIMIT \$1 OFFSET \$2$/);
  assert.deepEqual(rows[0]!.counts, { fixed: 3, balances: 2, activeShares: 1 });
  assert.deepEqual(rows[0]!.providers, ["kakao"]);
  assert.equal(rows[0]!.displayName, null);
  await listUsers(f.db, { limit: 100000, offset: -5 });
  assert.deepEqual(f.calls[1]!.params, [200, 0], "한 페이지 상한과 음수 offset 방지");
});

test("집계 SQL: 재무 테이블에서는 count(*) 와 소유자·폐기·만료 조건만 — 금액·이름·메모·라벨 열 없음", async () => {
  const f = fakeDb(() => ({ rows: [] }));
  await listUsers(f.db, { limit: 50, offset: 0 });
  const sql = f.calls[0]!.text;
  assert.equal([...sql.matchAll(/FROM myfp\.(fixed_expenses|balance_items|share_links)\b/g)].length, 3, "재무 테이블은 개수 하위 쿼리 3곳에서만");
  const subqueries = [...sql.matchAll(/\(SELECT count\(\*\) FROM myfp\.(?:fixed_expenses|balance_items|share_links) .*?\)::int/g)].map((m) => m[0]);
  assert.equal(subqueries.length, 3);
  for (const q of subqueries) {
    assert.doesNotMatch(q, /amount|name|note|label|institution|monthly_payment|interest_rate|category|scopes|masks|token_hash|external_key/, q);
  }
  // 바깥 SELECT 도 재무 테이블 별칭(f.·b.·s.)으로는 user_id·폐기·만료 외 열을 읽지 않는다
  for (const m of sql.matchAll(/\b([fbs])\.([a-z_]+)/g)) assert.ok(["user_id", "revoked_at", "expires_at"].includes(m[2]!), m[0]);
  assert.doesNotMatch(sql, /JOIN myfp\.(fixed_expenses|balance_items|share_links)/);
});

test("이름·이메일이 없으면 「이름 없음 · #짧은ID」로 서로 구분되고, 있으면 표시 이름 → 공급자 이름 → 이메일 순", () => {
  const a = { id: "aaaaaaaa-0000-4000-8000-000000000001", displayName: null, name: null, email: null };
  const b = { ...a, id: "bbbbbbbb-0000-4000-8000-000000000002" };
  assert.equal(userPrimaryLabel(a), "이름 없음 · #aaaaaaaa");
  assert.notEqual(userPrimaryLabel(a), userPrimaryLabel(b));
  assert.equal(shortUserId(b.id), "bbbbbbbb");
  assert.equal(userPrimaryLabel({ ...a, email: "user@example.com" }), "user@example.com");
  assert.equal(userPrimaryLabel({ ...a, name: "공급자", email: "user@example.com" }), "공급자");
  assert.equal(userPrimaryLabel({ ...a, displayName: "표시", name: "공급자" }), "표시");
});

test("공급자 배지·서울 시간·페이지 번호", () => {
  assert.deepEqual(["google", "kakao", "credentials"].map(providerLabel), ["Google", "Kakao", "비상 로그인"]);
  assert.match(formatSeoulDateTime(new Date("2026-10-11T15:30:00Z")), /2026\D+10\D+12\D+00:30/, "UTC 15:30 은 서울 다음 날 00:30");
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage("3"), 3);
  for (const bad of ["0", "-1", "abc", "1e3", "999999", ""]) assert.equal(parsePage(bad), 1, bad);
  assert.equal(parsePage(["2", "5"]), 2);
});

test("관리자 가드: 목록 페이지는 requireAdmin 을 첫 return·목록 조회보다 먼저 부르고, listUsers 는 관리자 페이지만 쓴다", () => {
  const page = readCode("src/app/admin/users/page.tsx");
  assert.ok(guardsBeforeFirstReturn(page, /await requireAdmin\(/));
  assert.ok(page.indexOf("await requireAdmin(") < page.indexOf("listUsers("));
  const importers = walk(path.join(root, "src"))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && f !== "src/lib/db/queries/users.ts" && /\blistUsers\(/.test(readCode(f)));
  assert.deepEqual(importers, ["src/app/admin/users/page.tsx"]);
});
