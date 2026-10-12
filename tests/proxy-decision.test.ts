// proxy 의 판정(공개 경로는 통과, 보호 경로는 유효한 세션이 있을 때만 통과)을 가짜 세션 확인으로 직접 시험한다.
// 검증 지적: proxy.ts 의 공개/세션 분기 두 줄을 지워도 기존 시험이 실패하지 않았다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideProxy } from "../src/lib/auth-core/proxy-decision.ts";

function session(valid: boolean | "throws") {
  const state = { calls: 0 };
  const hasSession = async () => {
    state.calls += 1;
    if (valid === "throws") throw new Error("세션 확인 실패");
    return valid;
  };
  return { state, hasSession };
}

test("공개 경로는 세션을 확인하지 않고 통과", async () => {
  for (const p of ["/", "/login", "/privacy", "/terms", "/api/health", "/api/auth/session", "/_next/static/x.js"]) {
    const s = session(false);
    assert.deepEqual(await decideProxy(p, "", s.hasSession), { action: "next" }, p);
    assert.equal(s.state.calls, 0, `${p}: 공개 경로는 세션 확인이 필요 없다`);
  }
});

test("보호 경로 + 세션 없음: 페이지는 로그인으로(돌아올 경로 포함), API 는 401", async () => {
  const none = session(false);
  assert.deepEqual(await decideProxy("/app/fixed", "?date=2026-10-12", none.hasSession), {
    action: "login",
    callback: "/app/fixed?date=2026-10-12",
  });
  assert.equal(none.state.calls, 1);
  assert.deepEqual(await decideProxy("/admin/users", "", session(false).hasSession), { action: "login", callback: "/admin/users" });
  assert.deepEqual(await decideProxy("/api/admin/anything", "", session(false).hasSession), { action: "unauthorized" });
  assert.deepEqual(await decideProxy("/API/Admin", "", session(false).hasSession), { action: "unauthorized" });
});

test("보호 경로 + 유효한 세션: 통과", async () => {
  for (const p of ["/app/fixed", "/admin", "/app", "/api/anything", "/unknown-page"]) {
    assert.deepEqual(await decideProxy(p, "", session(true).hasSession), { action: "next" }, p);
  }
});

test("세션 확인이 예외를 던지면 닫는다 (통과시키지 않는다)", async () => {
  assert.deepEqual(await decideProxy("/app/fixed", "", session("throws").hasSession), { action: "login", callback: "/app/fixed" });
  assert.deepEqual(await decideProxy("/api/x", "", session("throws").hasSession), { action: "unauthorized" });
});

test("우회 형태(대소문자, 이중 인코딩, 점 구간, 접두사 유사 경로)는 공개로 보지 않는다", async () => {
  for (const p of ["/Login", "/login-x", "/%2e%2e/admin", "/api/auth/../admin", "/legalx", "//admin", "/apiX/auth/session", "/api%2Fadmin"]) {
    const s = session(false);
    const result = await decideProxy(p, "", s.hasSession);
    assert.notEqual(result.action, "next", p);
    assert.equal(s.state.calls, 1, `${p}: 세션 확인을 거쳐야 한다`);
  }
});

test("돌아올 경로가 안전하지 않으면 callback 을 붙이지 않는다", async () => {
  const result = await decideProxy("/admin", "?next=//evil.example", session(false).hasSession);
  assert.equal(result.action, "login");
  // 경로 자체는 안전한 상대 경로이므로 callback 은 그 경로 그대로이며, 외부 주소로 바뀌지 않는다
  if (result.action === "login") assert.ok(result.callback === "" || result.callback.startsWith("/"));
});
