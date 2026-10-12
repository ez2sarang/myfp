// 로그인 시 사용자 생성·연결 정책: 승인제, ADMIN_EMAILS 자동 승인, 검증된 이메일만 기존 계정에 연결(Kakao 는 연결 안 함), blocked 거부.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canLinkByEmail, decideProvision, type ProvisionInput } from "../src/lib/auth-core/provision.ts";

const ADMINS = "owner@example.com";

function input(over: Partial<ProvisionInput> = {}): ProvisionInput {
  return { provider: "google", accountId: "g-1", email: "user@example.com", linked: null, emailMatch: null, adminEmailsRaw: ADMINS, ...over };
}

test("신규 가입은 pending(승인 대기), ADMIN_EMAILS 의 검증된 Google 이메일은 active + 관리자", () => {
  assert.deepEqual(decideProvision(input()), { deny: false, action: "create", status: "pending", ensureAdmin: false });
  assert.deepEqual(decideProvision(input({ email: "OWNER@example.com" })), { deny: false, action: "create", status: "active", ensureAdmin: true });
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
  assert.deepEqual(d, { deny: false, action: "create", status: "pending", ensureAdmin: false });
});

test("이메일이 없으면(미검증 Google) 연결하지 않는다. 비상용 credentials 는 관리자 이메일로 연결된다", () => {
  assert.equal(canLinkByEmail("google", null), false);
  assert.deepEqual(decideProvision(input({ email: null, emailMatch: { status: "active", role: "admin" } })), {
    deny: false,
    action: "create",
    status: "pending",
    ensureAdmin: false,
  });
  const cred = decideProvision(input({ provider: "credentials", accountId: "owner@example.com", email: "owner@example.com", emailMatch: { status: "active", role: "admin" } }));
  assert.deepEqual(cred, { deny: false, action: "link", status: "active", ensureAdmin: true });
});

test("계정 id 가 없거나 모르는 공급자는 거부", () => {
  assert.deepEqual(decideProvision(input({ accountId: "" })), { deny: true, reason: "invalid_account" });
  assert.deepEqual(decideProvision(input({ accountId: null })), { deny: true, reason: "invalid_account" });
  assert.deepEqual(decideProvision(input({ provider: "github" })), { deny: true, reason: "unsupported_provider" });
});
