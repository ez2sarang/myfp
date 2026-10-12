// 세션 쿠키 속성 시험 (검증 지적 B4). 운영은 __Host- 접두사 + Secure + HttpOnly + SameSite=Lax + Path=/ (Domain 없음),
// http 로컬 개발만 접두사 없는 이름과 Secure 없음. 속성이 약해지면(예: httpOnly false) 이 시험이 실패해야 한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionCookieFor } from "../src/lib/auth-core/cookie.ts";
import { readCode } from "./source-contract-helpers.ts";

test("운영(NODE_ENV=production): __Host- 쿠키, Secure, HttpOnly, SameSite=lax, Path=/, Domain 없음", () => {
  const cookie = sessionCookieFor("https://myfp.pineai.dev", "production");
  assert.equal(cookie.name, "__Host-authjs.session-token");
  assert.deepEqual(cookie.options, { httpOnly: true, sameSite: "lax", path: "/", secure: true });
  assert.equal("domain" in cookie.options, false, "__Host- 쿠키는 Domain 속성을 가질 수 없다");
});

test("운영에서 AUTH_URL 이 없거나 http 여도 production 이면 __Host- 쿠키 (약한 쪽으로 떨어지지 않는다)", () => {
  for (const authUrl of [undefined, "", "not a url", "http://myfp.pineai.dev"]) {
    const cookie = sessionCookieFor(authUrl, "production");
    assert.equal(cookie.name, "__Host-authjs.session-token", String(authUrl));
    assert.equal(cookie.options.secure, true, String(authUrl));
    assert.equal(cookie.options.httpOnly, true, String(authUrl));
    assert.equal(cookie.options.path, "/", String(authUrl));
  }
});

test("http 로컬 개발: 접두사 없는 이름, Secure 없음, 그래도 HttpOnly, SameSite=lax, Path=/", () => {
  for (const authUrl of ["http://localhost:3330", undefined, ""]) {
    const cookie = sessionCookieFor(authUrl, "development");
    assert.equal(cookie.name, "authjs.session-token", String(authUrl));
    assert.deepEqual(cookie.options, { httpOnly: true, sameSite: "lax", path: "/", secure: false }, String(authUrl));
  }
});

test("개발 모드여도 AUTH_URL 이 https 이면 __Host- 쿠키", () => {
  const cookie = sessionCookieFor("https://staging.example.com", "development");
  assert.equal(cookie.name, "__Host-authjs.session-token");
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.httpOnly, true);
});

test("auth.ts 는 이 쿠키 설정을 Auth.js 세션 쿠키로 그대로 쓰고 useSecureCookies 도 같은 값을 따른다", () => {
  const code = readCode("src/lib/auth.ts");
  assert.match(code, /cookies:\s*\{\s*sessionToken:\s*SESSION_COOKIE\s*\}/);
  assert.match(code, /useSecureCookies:\s*SESSION_COOKIE\.options\.secure/);
});
