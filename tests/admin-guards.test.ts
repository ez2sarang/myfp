// 사용자 상태 변경 보호 규칙과 화면 관문 판정.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStatusChange } from "../src/lib/admin/guards.ts";
import { decideGate, decideShareAccess, isActiveAdmin } from "../src/lib/auth-core/gate.ts";
import { buildLoginUrl } from "../src/lib/auth-core/callback-url.ts";

const A = "a";
const B = "b";

test("자기 자신을 차단·대기로 바꿀 수 없다", () => {
  const r = checkStatusChange({ actorId: A, target: { id: A, status: "active", role: "admin" }, newStatus: "blocked", activeAdminIds: [A, B] });
  assert.deepEqual(r.ok ? null : r.code, "self_lockout");
});

test("마지막 활성 관리자는 차단할 수 없고, 다른 관리자가 있으면 가능", () => {
  const last = checkStatusChange({ actorId: B, target: { id: A, status: "active", role: "admin" }, newStatus: "blocked", activeAdminIds: [A] });
  assert.equal(last.ok ? null : last.code, "last_admin");
  assert.equal(checkStatusChange({ actorId: B, target: { id: A, status: "active", role: "admin" }, newStatus: "blocked", activeAdminIds: [A, B] }).ok, true);
});

test("승인(pending→active)·차단 해제는 허용, 같은 상태로의 변경은 거부", () => {
  assert.equal(checkStatusChange({ actorId: A, target: { id: B, status: "pending", role: "member" }, newStatus: "active", activeAdminIds: [A] }).ok, true);
  assert.equal(checkStatusChange({ actorId: A, target: { id: B, status: "blocked", role: "member" }, newStatus: "active", activeAdminIds: [A] }).ok, true);
  const same = checkStatusChange({ actorId: A, target: { id: B, status: "active", role: "member" }, newStatus: "active", activeAdminIds: [A] });
  assert.equal(same.ok ? null : same.code, "no_change");
});

test("관문: 비로그인→login, 대기→pending, 차단→blocked, 활성→ok. 관리자는 활성 + admin 만", () => {
  assert.equal(decideGate(null), "login");
  assert.equal(decideGate({ status: "pending" }), "pending");
  assert.equal(decideGate({ status: "blocked" }), "blocked");
  assert.equal(decideGate({ status: "active" }), "ok");
  assert.equal(isActiveAdmin({ status: "active", role: "admin" }), true);
  assert.equal(isActiveAdmin({ status: "pending", role: "admin" }), false);
  assert.equal(isActiveAdmin({ status: "active", role: "member" }), false);
  assert.equal(isActiveAdmin(null), false);
});

test("공유 보기 열람: 비로그인→login, blocked→blocked, active·pending→ok. /app 관문은 그대로 pending 을 막는다", () => {
  assert.equal(decideShareAccess(null), "login");
  assert.equal(decideShareAccess({ status: "blocked" }), "blocked");
  assert.equal(decideShareAccess({ status: "pending" }), "ok");
  assert.equal(decideShareAccess({ status: "active" }), "ok");
  assert.equal(decideGate({ status: "pending" }), "pending", "공유 보기 허용이 /app 판정을 바꾸지 않는다");
});

test("로그인 뒤 공유 주소로 복귀: callbackUrl 은 /s/<토큰> 상대 경로, 이상한 토큰은 돌아올 주소를 붙이지 않는다", () => {
  const token = `${"A".repeat(21)}${"b".repeat(22)}`;
  assert.equal(buildLoginUrl(`/s/${token}`), `/login?callbackUrl=%2Fs%2F${token}`);
  assert.equal(buildLoginUrl("/s/..\\evil"), "/login");
  assert.equal(buildLoginUrl("//evil.example/s/x"), "/login");
});
