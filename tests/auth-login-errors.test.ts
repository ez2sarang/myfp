import assert from "node:assert/strict";
import { test } from "node:test";
import { loginErrorMessage } from "../src/lib/auth-core/login-errors.ts";

test("로그인 오류 코드는 한국어 안내로, 알 수 없는 코드는 일반 문구로 바뀐다", () => {
  assert.match(loginErrorMessage("AccessDenied") ?? "", /로그인할 수 없습니다/);
  assert.match(loginErrorMessage("CredentialsSignin") ?? "", /관리자 로그인 정보/);
  assert.equal(loginErrorMessage(null), null);
  assert.equal(loginErrorMessage(""), null);
  const fallback = loginErrorMessage("SomethingInternal");
  assert.match(fallback ?? "", /다시 시도/);
  // 객체 프로토타입 키로 내부 값이 새지 않는다
  for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) assert.equal(loginErrorMessage(key), fallback, key);
});
