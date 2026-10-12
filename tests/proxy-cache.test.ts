// proxy 응답의 캐시 헤더: 로그인 이동(303)·401 은 no-store, 세션이 유효하면 proxy 는 캐시 헤더를 건드리지 않아 경로 규칙
// (/ocr/* 의 private 1년 불변 캐시)이 그대로 적용된다. next.config 의 헤더 규칙은 응답 상태를 가리지 않으므로, 규칙 목록만 보는
// 시험으로는 "로그인 이동 응답에 불변 캐시가 붙는" 버그를 잡지 못했다 → proxy 함수를 직접 불러 응답 헤더를 본다.
// (Next 서버에서 proxy 의 no-store 가 설정 규칙의 값보다 우선함은 next start + curl -I 로 확인했다: 비로그인 303 no-store, 로그인 200 immutable)
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import nextConfig from "../next.config.ts";

// 시험 프로세스에서만: Next 번들러가 풀어 주는 지정자(next/server, @/…)를 Node 가 찾을 수 있게 바꾼다.
// registerHooks 는 Node 22.15+/23.5+ API 인데 @types/node 20 에는 아직 없어 타입만 직접 적는다.
type Resolve = (specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: Resolve }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});

const SECRET = "test-only-secret-not-used-anywhere-0123456789abcdef";
process.env.AUTH_SECRET = SECRET;
const { proxy } = await import("../src/proxy.ts");
const { NextRequest } = await import("next/server.js");
const { encode } = await import("next-auth/jwt");
const { SESSION_COOKIE } = await import("../src/lib/auth-core/cookie.ts");

const ASSET = "http://localhost/ocr/models/rec-ko-dict.a7872c92.txt";

async function call(url: string, cookie?: string) {
  return proxy(new NextRequest(url, { headers: cookie ? { cookie } : {} }));
}

test("비로그인 /ocr/* 는 로그인 이동(303)이고 no-store — 불변 캐시가 붙지 않는다", async () => {
  for (const cookie of [undefined, `${SESSION_COOKIE.name}=garbage`]) {
    const res = await call(ASSET, cookie);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /immutable|max-age/);
    assert.match(res.headers.get("location") ?? "", /\/login\?callbackUrl=%2Focr%2F/);
  }
});

test("비로그인 API 는 401 no-store, 페이지는 303 no-store", async () => {
  const api = await call("http://localhost/api/anything");
  assert.equal(api.status, 401);
  assert.equal(api.headers.get("cache-control"), "no-store");
  const page = await call("http://localhost/app/import/photo");
  assert.equal(page.status, 303);
  assert.equal(page.headers.get("cache-control"), "no-store");
});

test("로그인 상태의 /ocr/* 는 proxy 가 그대로 통과시키고(캐시 헤더 없음) 경로 규칙의 private 불변 캐시가 적용된다", async () => {
  const token = await encode({ token: { uid: "test-user" }, secret: SECRET, salt: SESSION_COOKIE.name });
  const res = await call(ASSET, `${SESSION_COOKIE.name}=${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-middleware-next"), "1");
  assert.equal(res.headers.get("cache-control"), null);
  const rules = (await nextConfig.headers?.()) ?? [];
  assert.deepEqual(rules.find((r) => r.source === "/ocr/:path*")?.headers, [{ key: "Cache-Control", value: "private, max-age=31536000, immutable" }]);
});
