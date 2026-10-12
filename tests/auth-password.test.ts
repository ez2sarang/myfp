import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { test } from "node:test";
import { FAILURE_DELAY_MS, authorizeAdminCredentials, credentialsEnabled, type CredentialEnv } from "../src/lib/auth-core/credentials.ts";
import { hashPassword, looksLikeHash, parseHash, verifyPassword } from "../src/lib/auth-core/password.ts";
import { createAttemptLimiter } from "../src/lib/auth-core/rate-limit.ts";

const PASSWORD = "correct horse battery staple";
// 시험 속도를 위해 비용을 낮춘 형식(N=1024)의 해시를 직접 만든다. 운영 해시는 hashPassword 기본값(N=32768)이다.
function makeFastHash(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 1024, r: 8, p: 1 });
  return ["scrypt", 1024, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

const fastHash = makeFastHash(PASSWORD);

test("hashPassword 기본값: 형식(scrypt:N:r:p:salt:hash, `$` 없음)과 검증 왕복", async () => {
  const stored = await hashPassword(PASSWORD);
  assert.match(stored, /^scrypt:32768:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.ok(!stored.includes("$"));
  assert.equal(looksLikeHash(stored), true);
  assert.equal(await verifyPassword(PASSWORD, stored), true);
  assert.equal(await verifyPassword(`${PASSWORD}!`, stored), false);
  assert.notEqual(await hashPassword(PASSWORD), stored, "소금이 달라 매번 다른 해시");
});

test("verifyPassword: 틀린 비밀번호, 빈 값, 타입 오류, 손상된 해시는 모두 false", async () => {
  assert.equal(await verifyPassword(PASSWORD, fastHash), true);
  assert.equal(await verifyPassword("wrong", fastHash), false);
  assert.equal(await verifyPassword("", fastHash), false);
  assert.equal(await verifyPassword(undefined, fastHash), false);
  assert.equal(await verifyPassword(12345, fastHash), false);
  assert.equal(await verifyPassword("x".repeat(2000), fastHash), false);
  for (const bad of [undefined, "", "plaintext", "scrypt:1:1:1:a:b", "bcrypt:1024:8:1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAA", "scrypt:1000:8:1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAA", `${fastHash}:extra`]) { // scan-public: allow (가짜 시험 값)
    assert.equal(await verifyPassword(PASSWORD, bad), false, String(bad));
  }
  assert.equal(parseHash("scrypt:2097152:8:1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAA"), null, "과도한 비용(N)은 거부"); // scan-public: allow (가짜 시험 값)
});

function env(overrides: Partial<CredentialEnv> = {}): CredentialEnv {
  return { enabled: "1", adminEmails: "Admin@Example.com", passwordHash: fastHash, ...overrides };
}

test("Credentials 는 플래그, 관리자 이메일 목록, 올바른 해시 형식이 모두 있어야 켜진다", () => {
  assert.equal(credentialsEnabled(env()), true);
  assert.equal(credentialsEnabled(env({ enabled: "true" })), true);
  assert.equal(credentialsEnabled(env({ enabled: undefined })), false);
  assert.equal(credentialsEnabled(env({ enabled: "0" })), false);
  assert.equal(credentialsEnabled(env({ enabled: "yes" })), false);
  assert.equal(credentialsEnabled(env({ adminEmails: "" })), false);
  assert.equal(credentialsEnabled(env({ adminEmails: "not-an-email" })), false);
  assert.equal(credentialsEnabled(env({ passwordHash: undefined })), false);
  assert.equal(credentialsEnabled(env({ passwordHash: "plain-password" })), false);
});

function harness(opts: { maxFailures?: number } = {}) {
  const delays: number[] = [];
  const limiter = createAttemptLimiter({ maxFailures: opts.maxFailures ?? 3, windowMs: 60_000 });
  let verifyCalls = 0;
  const verify = async (plain: unknown, hash: string | undefined) => {
    verifyCalls += 1;
    return verifyPassword(plain, hash);
  };
  return {
    delays,
    limiter,
    get verifyCalls() {
      return verifyCalls;
    },
    run: (email: unknown, password: unknown, e = env(), clientKeys: string[] = ["ip:1.2.3.4"]) =>
      authorizeAdminCredentials({
        email,
        password,
        clientKeys,
        env: e,
        limiter,
        verify,
        dummyHash: async () => fastHash,
        delay: async (ms) => void delays.push(ms),
      }),
  };
}

test("올바른 이메일(대소문자·공백 무관)과 비밀번호만 통과, 실패에는 고정 지연", async () => {
  const h = harness();
  const good = await h.run("  ADMIN@example.COM ", PASSWORD);
  assert.deepEqual(good, { ok: true, email: "admin@example.com" });
  assert.deepEqual(h.delays, [], "성공에는 지연이 없다");
  const badPassword = await h.run("admin@example.com", "nope");
  assert.deepEqual(badPassword, { ok: false, reason: "invalid" });
  const unlisted = await h.run("other@example.com", PASSWORD);
  assert.deepEqual(unlisted, { ok: false, reason: "invalid" });
  assert.deepEqual(h.delays, [FAILURE_DELAY_MS, FAILURE_DELAY_MS]);
});

test("목록에 없는 이메일도 같은 해시 계산을 수행한다 (응답 시간으로 계정 존재 추측 방지)", async () => {
  const h = harness();
  await h.run("admin@example.com", "nope");
  const listedCalls = h.verifyCalls;
  await h.run("ghost@example.com", "nope");
  assert.equal(h.verifyCalls - listedCalls, 1);
  await h.run(undefined, "nope");
  await h.run("", "");
});

test("실패가 한도를 넘으면 맞는 비밀번호도 잠금, 다른 이메일·다른 클라이언트에는 영향이 제한적", async () => {
  const h = harness({ maxFailures: 3 });
  for (let i = 0; i < 3; i += 1) assert.equal((await h.run("admin@example.com", "nope")).ok, false);
  const locked = await h.run("admin@example.com", PASSWORD);
  assert.deepEqual(locked, { ok: false, reason: "locked" });
  // 같은 클라이언트(IP)도 잠겨 있다
  const sameIp = await h.run("admin@example.com", PASSWORD, env(), ["ip:1.2.3.4"]);
  assert.equal(sameIp.ok === false && sameIp.reason, "locked");
  // 다른 IP 에서도 이메일 키가 잠겨 있으면 거부 (IP 헤더를 바꿔 우회 불가)
  const otherIp = await h.run("admin@example.com", PASSWORD, env(), ["ip:9.9.9.9"]);
  assert.equal(otherIp.ok === false && otherIp.reason, "locked");
});

test("비활성 환경에서는 어떤 입력도 disabled", async () => {
  const h = harness();
  assert.deepEqual(await h.run("admin@example.com", PASSWORD, env({ enabled: undefined })), { ok: false, reason: "disabled" });
  assert.equal(h.verifyCalls, 0);
});

test("실패 한도 제한기: 창 만료 후 초기화, reset, 키 수 상한", () => {
  let t = 0;
  const limiter = createAttemptLimiter({ maxFailures: 2, windowMs: 1000, maxKeys: 3, now: () => t });
  limiter.recordFailure("a");
  assert.equal(limiter.isBlocked("a"), false);
  limiter.recordFailure("a");
  assert.equal(limiter.isBlocked("a"), true);
  t = 1001;
  assert.equal(limiter.isBlocked("a"), false, "창이 지나면 풀린다");
  limiter.recordFailure("a");
  limiter.recordFailure("a");
  limiter.reset("a");
  assert.equal(limiter.isBlocked("a"), false);
  for (const k of ["k1", "k2", "k3", "k4", "k5"]) limiter.recordFailure(k);
  limiter.recordFailure("k5");
  assert.equal(limiter.isBlocked("k5"), true, "상한을 넘어도 최근 키는 유지");
});
