// 표시 이름: 검증 규칙(앞뒤 공백·길이는 문자 수·제어 문자·이모지), 본인 행만 바꾸는 쿼리(IDOR 차단), 노출 범위(본인·관리자만), 계정 삭제 시 함께 삭제.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { validateDisplayName } from "../src/lib/account/display-name.ts";
import { deleteAccount } from "../src/lib/db/queries/account.ts";
import { findShareByTokenHash } from "../src/lib/db/queries/share.ts";
import { getDisplayName, setDisplayName } from "../src/lib/db/queries/users.ts";
import { fakeDb } from "./fake-db.ts";
import { readCode, root, walk } from "./source-contract-helpers.ts";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";

test("검증: 앞뒤 공백을 지우고 1~30자(문자 수 기준), 이모지·HTML 글자는 그대로 허용", () => {
  assert.deepEqual(validateDisplayName("  가상 이름  "), { ok: true, value: "가상 이름" });
  assert.deepEqual(validateDisplayName("가"), { ok: true, value: "가" });
  assert.equal(validateDisplayName("가".repeat(30)).ok, true);
  assert.equal(validateDisplayName("가".repeat(31)).ok, false);
  assert.deepEqual(validateDisplayName("가" + "😀".repeat(29)), { ok: true, value: "가" + "😀".repeat(29) }, "이모지는 UTF-16 으로 2칸이지만 1자다(글자와 함께)");
  assert.equal(validateDisplayName("가" + "😀".repeat(30)).ok, false);
  assert.equal(validateDisplayName("😀😀").ok, false, "보이는 글자(문자·숫자) 없이 이모지만은 거부");
  assert.deepEqual(validateDisplayName("<b>이름</b>"), { ok: true, value: "<b>이름</b>" });
  assert.deepEqual(validateDisplayName("\u3000이름\u3000"), { ok: true, value: "이름" }, "전각 공백도 앞뒤에서 지운다");
});

test("검증: 빈 값·공백만·문자열 아님·줄바꿈·제어 문자·양방향 서식 문자는 거부", () => {
  for (const bad of ["", "   ", "\t", null, undefined, 42, ["a"], "가\n나", "가\r나", "가\t나", "가\u0000나", "가\u007f나", "가\u0085나", "가\u2028나", "가\u202e나", "가\u2066나", "가\u200f나"]) {
    assert.equal(validateDisplayName(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(validateDisplayName("가\u200d나").ok, false, "폭 없는 결합자(ZWJ)도 서식 문자라 거부");
  for (const ch of ["\u200b", "\u3164", "\u115f", "\u00ad", "\u{E0041}"]) {
    assert.equal(validateDisplayName(`엄마${ch}`).ok, false, "그룹 태그와 같은 규칙: 보이지 않는 문자·채움 문자");
  }
  assert.deepEqual(validateDisplayName("엄마".normalize("NFD")), { ok: true, value: "엄마" }, "NFC 로 저장");
});

test("저장 쿼리: 세션 사용자 id 하나로만 범위가 묶이고, id 형식이 아니면 쿼리하지 않는다", async () => {
  const f = fakeDb(() => ({ rows: [], rowCount: 1 }));
  assert.equal(await setDisplayName(f.db, ME, "가상 이름"), true);
  assert.equal(await setDisplayName(f.db, ME, null), true);
  assert.deepEqual(
    f.calls.map((c) => [c.text, c.params]),
    [
      ["UPDATE myfp.users SET display_name = $2 WHERE id = $1", [ME, "가상 이름"]],
      ["UPDATE myfp.users SET display_name = $2 WHERE id = $1", [ME, null]],
    ],
  );
  const g = fakeDb();
  assert.equal(await setDisplayName(g.db, "not-a-uuid", "x"), false);
  assert.equal(await getDisplayName(g.db, "1 OR 1=1"), null);
  assert.equal(g.calls.length, 0);
});

test("읽기 쿼리는 0005 적용 전에도 깨지지 않게 to_jsonb 로 읽는다", async () => {
  const f = fakeDb(() => ({ rows: [{ display_name: null }] }));
  assert.equal(await getDisplayName(f.db, ME), null);
  assert.match(f.calls[0]!.text, /to_jsonb\(u\) ->> 'display_name'/);
  assert.deepEqual(f.calls[0]!.params, [ME]);
});

test("서버 액션: Origin 강제 → requireActiveUser → 검증 → 세션 사용자 id 로만 저장 (폼의 사용자 id 를 읽지 않는다)", () => {
  const code = readCode("src/lib/actions/account.ts");
  const start = code.indexOf("export async function updateDisplayNameAction");
  const body = code.slice(start, code.indexOf("export async function", start + 10));
  const order = ["await assertSameOrigin()", "await requireActiveUser(", "validateDisplayName(", "setDisplayName(db, viewer.id,"].map((n) => body.indexOf(n));
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.doesNotMatch(body, /formData\.get\(["'](userId|user_id|id)["']\)/);
});

test("노출 범위: 표시 이름은 설정·대시보드 안내·관리자 화면과 그 쿼리에서만 다루고, 공유 보기 코드에는 없다", () => {
  const allowed = new Set([
    "src/lib/account/display-name.ts",
    "src/lib/actions/account.ts",
    "src/lib/admin/user-label.ts",
    "src/lib/db/queries/users.ts",
    "src/app/app/settings/page.tsx",
    "src/app/app/page.tsx",
    "src/app/admin/users/page.tsx",
    "src/components/settings/display-name-form.tsx",
    "src/components/app-shell/display-name-hint.tsx",
  ]);
  // 표시 이름 데이터(열 display_name 과 그 읽기·쓰기·검증·화면 부품)를 다루는 파일. AppShell 의 displayName 속성(공급자 이름 표시)은 별개다.
  const DATA = /display_name|getDisplayName|setDisplayName|validateDisplayName|updateDisplayNameAction|DisplayNameForm|DisplayNameHint/;
  const users = walk(path.join(root, "src"))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && DATA.test(readFileSync(path.join(root, f), "utf8")));
  for (const f of ["src/lib/db/queries/users.ts", "src/lib/actions/account.ts", "src/app/app/settings/page.tsx"]) assert.ok(users.includes(f), `검사가 ${f} 를 찾아야 한다`);
  for (const f of users) assert.ok(allowed.has(f), `허용 목록 밖에서 표시 이름을 다룸: ${f}`);
  for (const f of walk(path.join(root, "src")).map((x) => path.relative(root, x).split(path.sep).join("/"))) {
    if (f.startsWith("src/lib/share/") || f.startsWith("src/app/s/") || f.startsWith("src/components/share/")) {
      assert.doesNotMatch(readFileSync(path.join(root, f), "utf8"), /display_name|DisplayName|to_jsonb\(u\)|listUsers|AdminUserRow/, f);
    }
  }
  // 세션 사용자(Viewer) 레코드에는 표시 이름을 싣지 않는다 — 공유 보기 등 다른 화면으로 흘러가지 않게
  assert.doesNotMatch(readCode("src/lib/session.ts"), /display/i);
  const record = readCode("src/lib/db/queries/users.ts");
  const getRecord = record.slice(record.indexOf("export async function getUserRecord"), record.indexOf("export interface AdminUserRow"));
  assert.doesNotMatch(getRecord, /display/);
});

test("공유 보기 직렬화: 토큰 조회는 링크 주인의 상태만 읽고 이름·이메일·표시 이름은 읽지 않는다", async () => {
  const f = fakeDb(() => ({ rows: [] }));
  await findShareByTokenHash(f.db, "a".repeat(64));
  const sql = f.calls[0]!.text;
  const userCols = [...sql.matchAll(/\bu\.([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(userCols)].sort(), ["id", "status"]);
  assert.doesNotMatch(sql, /display_name|to_jsonb\(u\)|u\.name|u\.email/);
});

test("계정 삭제는 사용자 행을 통째로 지운다(표시 이름 열 포함): users 는 UPDATE 하지 않고 마지막에 DELETE", async () => {
  const f = fakeDb((c) => (c.text.startsWith("SELECT role, status FROM myfp.users") ? { rows: [{ role: "member", status: "active" }] } : { rows: [], rowCount: 1 }));
  assert.deepEqual(await deleteAccount(f.db, ME), { ok: true });
  assert.equal(f.calls.some((c) => /^UPDATE myfp\.users/.test(c.text)), false);
  const last = f.calls.at(-1)!;
  assert.equal(last.text, "DELETE FROM myfp.users WHERE id = $1");
  assert.deepEqual(last.params, [ME]);
});

test("마이그레이션 0005: myfp.users 에 display_name(널 허용)과 1~30자 CHECK, 여러 번 적용해도 같다", () => {
  const sql = readFileSync(path.join(root, "db/migrations/0005_display_name.sql"), "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /ALTER TABLE myfp\.users ADD COLUMN IF NOT EXISTS display_name text;/);
  assert.match(sql, /CHECK \(display_name IS NULL OR char_length\(display_name\) BETWEEN 1 AND 30\)/);
  assert.match(sql, /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'users_display_name_chk'/);
  assert.doesNotMatch(sql, /NOT NULL/);
  for (const m of sql.matchAll(/\b(?:TABLE|ON)\s+([a-z_]+)\.?([a-z_]*)/gi)) {
    if (m[2]) assert.equal(m[1], "myfp", m[0]);
  }
});
