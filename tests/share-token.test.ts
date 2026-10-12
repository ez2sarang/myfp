// 공유 토큰: 256비트 CSPRNG, base64url 43자, DB 에는 SHA-256 해시만, 만료·폐기 판정.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { expiryFrom, generateShareToken, hashShareToken, isWellFormedToken, shareLinkState, shareUrl } from "../src/lib/share/token.ts";

test("토큰은 32바이트 base64url(43자)이고 해시는 SHA-256 16진수 64자다", () => {
  const { token, hash } = generateShareToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(hashShareToken(token), hash);
  assert.notEqual(hash, token, "원문을 그대로 저장하지 않는다");
  assert.notEqual(generateShareToken().token, token, "매번 다른 토큰");
});

test("형식 검사: 43자 base64url 만 통과", () => {
  assert.equal(isWellFormedToken(generateShareToken().token), true);
  for (const bad of ["", "short", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`, `${"a".repeat(42)}+`, "../../etc/passwd", null, undefined, 42, {}]) {
    assert.equal(isWellFormedToken(bad), false, String(bad));
  }
});

test("상태: 폐기 > 만료 > 사용 중. 만료 시각과 같으면 만료", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  assert.equal(shareLinkState({ expiresAt: null, revokedAt: null }, now), "active");
  assert.equal(shareLinkState({ expiresAt: new Date("2026-10-13T00:00:00Z"), revokedAt: null }, now), "active");
  assert.equal(shareLinkState({ expiresAt: now, revokedAt: null }, now), "expired");
  assert.equal(shareLinkState({ expiresAt: new Date("2026-10-11T00:00:00Z"), revokedAt: null }, now), "expired");
  assert.equal(shareLinkState({ expiresAt: null, revokedAt: new Date("2026-10-01T00:00:00Z") }, now), "revoked");
});

test("만료 선택: 7/30/90일·무기한만 허용", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  const seven = expiryFrom("7", now);
  assert.ok(seven.ok && seven.expiresAt?.toISOString() === "2026-10-19T00:00:00.000Z");
  const never = expiryFrom("never", now);
  assert.ok(never.ok && never.expiresAt === null);
  for (const bad of ["1", "365", "", undefined, "abc"]) assert.equal(expiryFrom(bad, now).ok, false, String(bad));
});

test("공유 주소: 기준 주소 끝 슬래시 정리", () => {
  assert.equal(shareUrl("https://myfp.pineai.dev/", "TOKEN"), "https://myfp.pineai.dev/s/TOKEN");
});
