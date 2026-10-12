// 소개 페이지의 로그인 상태 힌트: /api/auth/session 응답에서 사용자 id 가 있는 문자열일 때만 로그인으로 본다(그 밖은 모두 로그아웃 = 안전한 실패).
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSignedInSession } from "../src/lib/auth-core/session-hint.ts";

test("사용자 id 가 비어 있지 않은 문자열이면 로그인 상태", () => {
  assert.equal(isSignedInSession({ user: { id: "x" } }), true);
  assert.equal(isSignedInSession({ expires: "2026-10-20T00:00:00.000Z", user: { id: "u-1" } }), true);
});

test("null·빈 객체·user 없음·id 빈 문자열·숫자 id·문자열 입력은 모두 로그아웃 상태", () => {
  for (const data of [null, undefined, {}, { user: null }, { user: {} }, { user: { id: "" } }, { user: { id: 42 } }, { user: "x" }, "signed-in", 1, []]) {
    assert.equal(isSignedInSession(data), false, JSON.stringify(data) ?? String(data));
  }
});
