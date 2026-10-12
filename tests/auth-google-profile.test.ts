// Google 프로필 변환의 이메일 검증 게이트 시험 (검증 지적 B1).
// 검증되지 않은 이메일은 ADMIN_EMAILS 와 일치해도 관리자 승격에 쓰이면 안 된다. 게이트는 auth-core 의 순수 함수에 있고,
// auth.ts 가 그 함수를 Google 공급자의 profile 변환으로 실제 연결했는지는 소스 계약으로 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBootstrapAdmin, normalizeEmail } from "../src/lib/auth-core/admin-emails.ts";
import { googleProfileToUser } from "../src/lib/auth-core/google-profile.ts";
import { decideProvision } from "../src/lib/auth-core/provision.ts";
import { readCode } from "./source-contract-helpers.ts";

const ADMINS = "boss@example.com";

function profile(overrides: Record<string, unknown> = {}) {
  return { sub: "g-123", name: "홍길동", email: "boss@example.com", email_verified: true, picture: "https://example.com/p.png", ...overrides };
}

/** auth.ts 의 signIn 콜백과 같은 경로: profile 변환 → 이메일 정규화 → 가입 판정. */
function provisionFor(raw: Record<string, unknown>) {
  const user = googleProfileToUser(raw as never);
  return decideProvision({
    provider: "google",
    accountId: user.id,
    email: normalizeEmail(user.email),
    linked: null,
    emailMatch: null,
    adminEmailsRaw: ADMINS,
    signupMode: "open",
    capacityFull: false,
  });
}

test("email_verified 가 true 이면 이메일을 소문자·공백 제거로 돌려준다", () => {
  const user = googleProfileToUser(profile({ email: "  Boss@Example.COM " }) as never);
  assert.equal(user.email, "boss@example.com");
  assert.equal(user.id, "g-123");
  assert.equal(user.name, "홍길동");
  assert.equal(user.image, "https://example.com/p.png");
});

test("email_verified 가 false, 누락, null, 문자열, 숫자이면 이메일은 null (boolean true 만 검증으로 인정)", () => {
  for (const value of [false, undefined, null, "true", "TRUE", "false", 1, 0, {}, []]) {
    const user = googleProfileToUser(profile({ email_verified: value }) as never);
    assert.equal(user.email, null, `email_verified=${JSON.stringify(value)}`);
  }
  const missing = profile();
  delete (missing as Record<string, unknown>).email_verified;
  assert.equal(googleProfileToUser(missing as never).email, null, "필드 자체가 없음");
});

test("검증된 이메일이어도 형식이 이상하거나 비어 있으면 null", () => {
  for (const email of [undefined, null, "", "   ", "no-at-sign", "a@b@c", 42]) {
    assert.equal(googleProfileToUser(profile({ email }) as never).email, null, `email=${JSON.stringify(email)}`);
  }
});

test("미검증 이메일이 ADMIN_EMAILS 와 일치해도 관리자로 승격되지 않는다 (일반 회원으로 가입)", () => {
  for (const value of [false, undefined, "true"]) {
    const decision = provisionFor(profile({ email_verified: value }));
    assert.ok(!decision.deny);
    assert.equal(decision.ensureAdmin, false, `email_verified=${JSON.stringify(value)}`);
    assert.equal(decision.status, "active");
    assert.equal(decision.reason, "open");
    assert.equal(isBootstrapAdmin({ email: googleProfileToUser(profile({ email_verified: value }) as never).email, provider: "google", adminEmailsRaw: ADMINS }), false);
  }
});

test("검증된 이메일(대소문자·공백이 달라도)이 ADMIN_EMAILS 와 일치하면 관리자 후보", () => {
  for (const email of ["boss@example.com", "BOSS@Example.com", "  boss@example.com  "]) {
    const decision = provisionFor(profile({ email }));
    assert.ok(!decision.deny);
    assert.equal(decision.ensureAdmin, true, email);
  }
});

test("auth.ts 의 Google 공급자는 profile 변환에 googleProfileToUser 를 쓴다 (게이트를 우회하는 인라인 변환 금지)", () => {
  const code = readCode("src/lib/auth.ts");
  assert.match(code, /import \{ googleProfileToUser \} from "@\/lib\/auth-core\/google-profile"/);
  assert.match(code, /Google\(\{[\s\S]*?profile\(profile\)\s*\{\s*return googleProfileToUser\(profile\);?\s*\}[\s\S]*?\}\),\s*Kakao/);
  assert.doesNotMatch(code, /profile\.email\b/, "auth.ts 가 profile.email 을 직접 읽으면 검증 게이트를 거치지 않는다");
});
