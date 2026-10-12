import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLoginErrorUrl, buildLoginUrl, safeCallbackPath, safeRedirectTarget } from "../src/lib/auth-core/callback-url.ts";

test("같은 사이트의 상대 경로는 그대로 통과 (쿼리, 해시 포함)", () => {
  assert.equal(safeCallbackPath("/app/fixed"), "/app/fixed");
  assert.equal(safeCallbackPath("/app/fixed?date=2026-10-12&tier=A"), "/app/fixed?date=2026-10-12&tier=A");
  assert.equal(safeCallbackPath("/admin/users?q=%ED%99%8D"), "/admin/users?q=%ED%99%8D");
  assert.equal(safeCallbackPath("  /app/share  "), "/app/share");
  assert.equal(safeCallbackPath("/a/b#section"), "/a/b#section");
});

const EVIL = [
  "https://evil.example/",
  "http://evil.example",
  "//evil.example",
  "///evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "\\/evil.example",
  "/%2f%2fevil.example",
  "/%2F/evil.example",
  "/%5cevil.example",
  "/%255cevil.example",
  "/%252f%252fevil.example",
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "evil.example",
  "mailto:a@b.c",
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r\nSet-Cookie: x=1",
  "/%09/evil.example",
  "/%0d%0aLocation:%20https://evil.example",
  "/%00",
  "/a\u0000b",
  "/\u007f",
  "@evil.example",
  ":@evil.example",
  "/%",
  "/%E0%A4%A",
  "",
  "   ",
];

test("외부 주소, 스킴, 이중 슬래시, 역슬래시, 제어 문자, 인코딩 우회는 모두 기본 경로로 대체", () => {
  assert.ok(EVIL.length >= 25);
  for (const input of EVIL) {
    assert.equal(safeCallbackPath(input), "/app", JSON.stringify(input));
  }
});

test("문자열이 아닌 입력과 지나치게 긴 입력도 기본 경로", () => {
  for (const input of [undefined, null, 0, {}, ["/a"], true]) assert.equal(safeCallbackPath(input), "/app");
  assert.equal(safeCallbackPath(`/${"a".repeat(600)}`), "/app");
});

test("로그인 루프·인증 엔드포인트로 되돌아가는 경로는 거부 (대소문자 무관)", () => {
  for (const input of ["/login", "/login?x=1", "/login/", "/Login", "/LOGIN/extra", "/api/auth/signout", "/API/AUTH/session"]) {
    assert.equal(safeCallbackPath(input), "/app", input);
  }
  assert.equal(safeCallbackPath("/login-help"), "/login-help");
});

test("fallback 인자와 빈 문자열 fallback", () => {
  assert.equal(safeCallbackPath("//x", "/"), "/");
  assert.equal(safeCallbackPath("//x", ""), "");
});

test("buildLoginUrl: 안전한 경로만 callbackUrl 로 붙인다", () => {
  assert.equal(buildLoginUrl(), "/login");
  assert.equal(buildLoginUrl("/app/fixed"), "/login?callbackUrl=%2Fapp%2Ffixed");
  assert.equal(buildLoginUrl("//evil.example"), "/login");
  assert.equal(buildLoginUrl("https://evil.example"), "/login");
  assert.equal(buildLoginUrl("/login"), "/login");
});

test("safeRedirectTarget: 같은 origin 절대 주소는 경로로 바꾸고 다른 origin 은 기본 경로", () => {
  const base = "https://myfp.pineai.dev";
  assert.equal(safeRedirectTarget("/app/fixed", base), "/app/fixed");
  assert.equal(safeRedirectTarget("https://myfp.pineai.dev/app/fixed?a=1", base), "/app/fixed?a=1");
  assert.equal(safeRedirectTarget("https://evil.example/app/fixed", base), "/app");
  assert.equal(safeRedirectTarget("https://myfp.pineai.dev.evil.example/", base), "/app");
  assert.equal(safeRedirectTarget("//evil.example", base), "/app");
  assert.equal(safeRedirectTarget("not a url", base), "/app");
  assert.equal(safeRedirectTarget("https://myfp.pineai.dev/login", base), "/app");
});

test("로그인 실패 주소: 오류 코드와 안전한 돌아갈 경로를 함께 유지한다 (재시도 성공 시 원래 경로로 이동)", () => {
  assert.equal(buildLoginErrorUrl("CredentialsSignin"), "/login?error=CredentialsSignin");
  assert.equal(buildLoginErrorUrl("CredentialsSignin", "/app/fixed?date=2026-10-12"), "/login?error=CredentialsSignin&callbackUrl=%2Fapp%2Ffixed%3Fdate%3D2026-10-12");
  assert.equal(buildLoginErrorUrl("CredentialsSignin", "https://evil.example/"), "/login?error=CredentialsSignin", "외부 주소는 붙이지 않는다");
  assert.equal(buildLoginErrorUrl("CredentialsSignin", "//evil.example"), "/login?error=CredentialsSignin");
  assert.equal(buildLoginErrorUrl("CredentialsSignin", "/login?x=1"), "/login?error=CredentialsSignin", "로그인 루프 경로는 붙이지 않는다");
});
