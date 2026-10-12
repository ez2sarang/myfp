import assert from "node:assert/strict";
import { test } from "node:test";
import { decideProxy } from "../src/lib/auth-core/proxy-decision.ts";
import { classifyPath, normalizeForMatch } from "../src/lib/auth-core/route-guard.ts";

test("공개 허용 목록: 정확히 일치하는 경로만 공개", () => {
  for (const p of [
    "/",
    "/login",
    "/login/",
    "/api/health",
    "/api/auth/signin",
    "/api/auth/callback/google",
    "/api/auth/callback/kakao",
    "/api/auth/session",
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/privacy",
    "/terms",
    "/guide",
    "/guide/",
    "/guide/fixed-expenses-ratio",
    "/guide/net-worth-calculation/",
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.ico",
    "/icon.svg",
    "/brand/logo.svg",
  ]) {
    assert.equal(classifyPath(p), "public", p);
  }
});

test("보호 경로: 페이지는 보호(redirect), /api 는 보호(401)", () => {
  for (const p of ["/app", "/app/fixed", "/app/assets", "/app/share", "/app/settings", "/app/pending", "/app/export/fixed", "/admin", "/admin/users", "/s", "/s/anything", "/legal"]) {
    assert.equal(classifyPath(p), "protected-page", p);
  }
  for (const p of ["/api/admin/users", "/api/anything", "/api", "/api/healthz", "/api/health/x"]) {
    assert.equal(classifyPath(p), "protected-api", p);
  }
});

test("로그인 이후 화면은 세션이 없으면 로그인으로 이동한다 (돌아올 경로 포함)", async () => {
  for (const p of ["/app", "/app/fixed", "/app/assets", "/app/share", "/app/settings", "/admin/users"]) {
    assert.deepEqual(await decideProxy(p, "", async () => false), { action: "login", callback: p }, p);
    assert.deepEqual(await decideProxy(p, "", async () => true), { action: "next" }, p);
  }
});

const BYPASS = [
  "/login-x",
  "/loginx",
  "/login.json",
  "/login/../admin",
  "/login/%2e%2e/admin",
  "/login/%2E%2E/admin",
  "/login/..%2fadmin",
  "/login/%252e%252e/admin",
  "/publicfoo",
  "/public",
  "/legalfoo",
  "/privacyx",
  "/terms-admin",
  "/guidex",
  "/guide-admin",
  "/guide/a/b",
  "/guide/Upper",
  "/guide/a_b",
  "/guide/../app",
  "/guide/%2e%2e/app",
  "/guide/x/%2e%2e/%2e%2e/app",
  "/Guide",
  "/sx/abc",
  "/s",
  "/s/../app",
  "/s/%2e%2e/app",
  "/S/abc",
  "/Login",
  "/LOGIN",
  "/Api/Health",
  "/API/health",
  "//login",
  "//admin",
  "///",
  "/login//",
  "/api//auth/session",
  "/api/auth/../admin/users",
  "/api/auth/%2e%2e/admin/users",
  "/api/auth%2f..%2fadmin",
  "/_nextx/anything",
  "/_next/../admin",
  "/_next/%2e%2e/admin",
  "/_next",
  "/brand/../admin",
  "/brandx",
  "/api/authx",
  "/api/auth",
  "\\login",
  "/login\\",
  "/\\admin",
  "/login%00",
  "/login%0a/../admin",
  "/%6cogin/../admin",
  "/login%2f..%2fadmin",
  "/robots.txt/../admin",
  "/sitemap.xml/../admin",
  "/.",
  "/./admin",
  "/admin/.",
  "/%2e/admin",
  "/%25",
  "/%zz",
  "/login%",
];

test("우회 입력 20개 이상은 어느 것도 공개가 아니다", () => {
  assert.ok(BYPASS.length >= 20);
  for (const p of BYPASS) {
    const got = classifyPath(p);
    assert.notEqual(got, "public", `${p} -> ${got}`);
  }
});

test("의심스러운 /api 경로는 401 형식으로 분류", () => {
  assert.equal(classifyPath("/api//auth/session"), "protected-api");
  assert.equal(classifyPath("/api/auth/../admin/users"), "protected-api");
  assert.equal(classifyPath("/API/x"), "protected-api");
});

test("정규화: 인코딩을 풀고 끝 슬래시를 제거, 의심 형태는 null", () => {
  assert.equal(normalizeForMatch("/%6cogin"), "/login");
  assert.equal(normalizeForMatch("/login/"), "/login");
  assert.equal(normalizeForMatch("/"), "/");
  assert.equal(normalizeForMatch("/a//b"), null);
  assert.equal(normalizeForMatch("/a/../b"), null);
  assert.equal(normalizeForMatch("/%2e%2e/b"), null);
  assert.equal(normalizeForMatch("login"), null);
  assert.equal(normalizeForMatch(""), null);
  assert.equal(normalizeForMatch(`/${"a".repeat(3000)}`), null);
});

test("정상 인코딩 경로(터보팩 청크 이름)는 공개 접두사 아래에서 그대로 공개", () => {
  assert.equal(classifyPath("/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client.js"), "public");
});

test("공유 보기 /s/<토큰> 은 공개가 아니다: 세션이 없으면 토큰 형식·유효 여부와 상관없이 같은 방식으로 로그인 이동(돌아올 주소 포함)", async () => {
  const valid = `/s/${"A".repeat(21)}${"b".repeat(22)}`;
  for (const p of [valid, "/s/invalid", "/s/x"]) {
    assert.equal(classifyPath(p), "protected-page", p);
    assert.deepEqual(await decideProxy(p, "", async () => false), { action: "login", callback: p }, p);
    assert.deepEqual(await decideProxy(p, "", async () => true), { action: "next" }, p);
  }
});
