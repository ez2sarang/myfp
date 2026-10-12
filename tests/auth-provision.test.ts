// 로그인 시 사용자 생성·연결 정책: 가입 즉시 사용(open), 안전장치(SIGNUP_MODE=approval, 활성 사용자 상한), ADMIN_EMAILS 관리자,
// 검증된 이메일만 기존 계정에 연결(Kakao 는 연결 안 함), blocked 거부.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canLinkByEmail, decideProvision, parseMaxActiveUsers, parseSignupMode, type ProvisionInput } from "../src/lib/auth-core/provision.ts";
import { provisionUser } from "../src/lib/db/queries/provision.ts";
import { fakeDb } from "./fake-db.ts";

const ADMINS = "owner@example.com";

function input(over: Partial<ProvisionInput> = {}): ProvisionInput {
  return {
    provider: "google",
    accountId: "g-1",
    email: "user@example.com",
    linked: null,
    emailMatch: null,
    adminEmailsRaw: ADMINS,
    signupMode: "open",
    capacityFull: false,
    ...over,
  };
}

test("신규 가입(open, 기본): 바로 active·member. ADMIN_EMAILS 의 검증된 Google 이메일은 active·관리자", () => {
  assert.deepEqual(decideProvision(input()), { deny: false, action: "create", status: "active", ensureAdmin: false, reason: "open" });
  assert.deepEqual(decideProvision(input({ email: "OWNER@example.com" })), { deny: false, action: "create", status: "active", ensureAdmin: true, reason: "admin_email" });
  const kakao = decideProvision(input({ provider: "kakao", accountId: "k-1", email: null }));
  assert.deepEqual(kakao, { deny: false, action: "create", status: "active", ensureAdmin: false, reason: "open" });
});

test("안전장치: approval 모드면 신규는 pending, 활성 사용자 상한 초과면 신규는 pending (관리자 이메일은 예외)", () => {
  assert.deepEqual(decideProvision(input({ signupMode: "approval" })), { deny: false, action: "create", status: "pending", ensureAdmin: false, reason: "approval_mode" });
  assert.deepEqual(decideProvision(input({ capacityFull: true })), { deny: false, action: "create", status: "pending", ensureAdmin: false, reason: "capacity" });
  assert.deepEqual(decideProvision(input({ email: "owner@example.com", capacityFull: true, signupMode: "approval" })), {
    deny: false,
    action: "create",
    status: "active",
    ensureAdmin: true,
    reason: "admin_email",
  });
  // 기존 사용자의 로그인은 모드·상한과 상관없이 상태 그대로
  assert.deepEqual(decideProvision(input({ linked: { status: "active", role: "member" }, signupMode: "approval", capacityFull: true })), {
    deny: false,
    action: "login",
    status: "active",
    ensureAdmin: false,
  });
});

test("SIGNUP_MODE·MAX_ACTIVE_USERS 값 검증: 미설정은 open·200, 모르는 모드 값은 안전하게 approval, 잘못된 상한은 200", () => {
  assert.equal(parseSignupMode(undefined), "open");
  assert.equal(parseSignupMode(""), "open");
  assert.equal(parseSignupMode(" OPEN "), "open");
  assert.equal(parseSignupMode("approval"), "approval");
  for (const bad of ["opne", "true", "closed", "1"]) assert.equal(parseSignupMode(bad), "approval", bad);
  assert.equal(parseMaxActiveUsers(undefined), 200);
  assert.equal(parseMaxActiveUsers("50"), 50);
  for (const bad of ["0", "-5", "abc", "1.5", "99999999"]) assert.equal(parseMaxActiveUsers(bad), 200, bad);
});

test("이미 연결된 로그인 수단: 상태는 그대로, blocked 는 거부(관리자 이메일이어도)", () => {
  assert.deepEqual(decideProvision(input({ linked: { status: "pending", role: "member" } })), { deny: false, action: "login", status: "pending", ensureAdmin: false });
  assert.deepEqual(decideProvision(input({ linked: { status: "blocked", role: "admin" }, email: "owner@example.com" })), { deny: true, reason: "blocked" });
});

test("검증된 Google 이메일이 같은 기존 사용자(예: 적재 스크립트로 만든 소유자)에 연결된다", () => {
  const d = decideProvision(input({ email: "owner@example.com", emailMatch: { status: "active", role: "admin" } }));
  assert.deepEqual(d, { deny: false, action: "link", status: "active", ensureAdmin: true });
  assert.deepEqual(decideProvision(input({ emailMatch: { status: "blocked", role: "member" } })), { deny: true, reason: "blocked" });
});

test("Kakao 는 이메일이 같아도 기존 계정에 연결되지 않고 관리자도 될 수 없다 (계정 탈취 방지)", () => {
  assert.equal(canLinkByEmail("kakao", "owner@example.com"), false);
  const d = decideProvision(input({ provider: "kakao", accountId: "k-1", email: "owner@example.com", emailMatch: { status: "active", role: "admin" } }));
  assert.deepEqual(d, { deny: false, action: "create", status: "active", ensureAdmin: false, reason: "open" });
});

test("이메일이 없으면(미검증 Google) 연결하지 않는다. 비상용 credentials 는 관리자 이메일로 연결된다", () => {
  assert.equal(canLinkByEmail("google", null), false);
  assert.equal(decideProvision(input({ email: null, emailMatch: { status: "active", role: "admin" } })).deny === false, true);
  const cred = decideProvision(input({ provider: "credentials", accountId: "owner@example.com", email: "owner@example.com", emailMatch: { status: "active", role: "admin" } }));
  assert.deepEqual(cred, { deny: false, action: "link", status: "active", ensureAdmin: true });
});

test("계정 id 가 없거나 모르는 공급자는 거부", () => {
  assert.deepEqual(decideProvision(input({ accountId: "" })), { deny: true, reason: "invalid_account" });
  assert.deepEqual(decideProvision(input({ accountId: null })), { deny: true, reason: "invalid_account" });
  assert.deepEqual(decideProvision(input({ provider: "github" })), { deny: true, reason: "unsupported_provider" });
});

test("provisionUser: 신규일 때만 활성 사용자 수를 세고, 상한 이상이면 pending 으로 넣는다", async () => {
  const run = async (activeCount: number, maxRaw: string | undefined, modeRaw?: string) => {
    const f = fakeDb((c) => {
      if (c.text.includes("count(*)")) return { rows: [{ n: String(activeCount) }] };
      if (c.text.startsWith("INSERT INTO myfp.users")) return { rows: [{ id: "u-new" }] };
      return { rows: [], rowCount: 1 };
    });
    const out = await provisionUser(f.db, { provider: "google", accountId: "g-9", email: "new@example.com", name: null, image: null, adminEmailsRaw: ADMINS, signupModeRaw: modeRaw, maxActiveUsersRaw: maxRaw });
    const insert = f.calls.find((c) => c.text.startsWith("INSERT INTO myfp.users"));
    return { out, status: insert?.params[3], counted: f.calls.some((c) => c.text.includes("count(*)")) };
  };
  assert.deepEqual((await run(10, undefined)).status, "active");
  assert.deepEqual((await run(200, undefined)).status, "pending", "기본 상한 200");
  assert.deepEqual((await run(5, "5")).status, "pending");
  assert.deepEqual((await run(0, undefined, "approval")).status, "pending");
  const existing = fakeDb((c) => (c.text.includes("FROM myfp.accounts a JOIN myfp.users u") ? { rows: [{ id: "u-1", status: "active", role: "member" }] } : { rows: [], rowCount: 1 }));
  await provisionUser(existing.db, { provider: "google", accountId: "g-1", email: null, name: null, image: null, adminEmailsRaw: ADMINS });
  assert.equal(existing.calls.some((c) => c.text.includes("count(*)")), false, "기존 사용자 로그인은 세지 않는다");
});
