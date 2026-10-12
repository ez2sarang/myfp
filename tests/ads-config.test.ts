// 광고 스위치: 기본 꺼짐, 잘못된 값은 꺼짐, 허용 경로는 /guide/<slug> 하나, serve 빌드에서만 가이드 글 CSP 를 넓힌다.
import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../next.config.ts";
import { MAX_ADS_PER_ARTICLE, adsEnabledFor, isAdPath, isValidAdClient, parseAdMode, readAdEnv } from "../src/lib/ads/config.ts";

const CLIENT = "ca-pub-0000000000000000";

test("모드: serve 만 켜짐, 미설정·그 밖의 값은 off", () => {
  assert.equal(parseAdMode(undefined), "off");
  for (const v of ["", "off", "on", "true", "1", "SERVE", "serve2", "test"]) assert.equal(parseAdMode(v), "off", v);
  assert.equal(parseAdMode("serve"), "serve");
  assert.equal(parseAdMode(" serve "), "serve");
});

test("client 는 ca-pub-<숫자 10~20자리> 만 유효", () => {
  assert.equal(isValidAdClient(CLIENT), true);
  for (const v of [undefined, "", "ca-pub-123", "pub-0000000000000000", "ca-pub-00000000000000000000000", "ca-pub-000000000a", " ca-pub-0000000000"]) {
    assert.equal(isValidAdClient(v), false, String(v));
  }
});

test("광고 허용 경로: /guide/<slug> 만", () => {
  const allowed = ["/guide/fixed-expenses-ratio", "/guide/net-worth-calculation/"];
  const denied = ["/", "/guide", "/guide/", "/guide/a/b", "/guide/A", "/guide/%2e%2e", "/app", "/app/guide/x", "/s/x", "/login", "/admin", "/privacy", "/terms", "/api/x"];
  for (const p of allowed) assert.equal(isAdPath(p), true, p);
  for (const p of denied) assert.equal(isAdPath(p), false, p);
});

test("serve·유효 client·허용 경로가 모두 맞을 때만 광고를 낸다", () => {
  assert.equal(adsEnabledFor("/guide/x", { mode: "serve", client: CLIENT, slot: undefined }), true);
  assert.equal(adsEnabledFor("/guide/x", { mode: "off", client: CLIENT, slot: undefined }), false);
  assert.equal(adsEnabledFor("/guide/x", { mode: "serve", client: "ca-pub-1", slot: undefined }), false);
  assert.equal(adsEnabledFor("/app", { mode: "serve", client: CLIENT, slot: undefined }), false);
  assert.equal(MAX_ADS_PER_ARTICLE, 2);
});

test("기본 환경(변수 없음)에서는 꺼져 있다", () => {
  const saved = { ...process.env };
  delete process.env.NEXT_PUBLIC_ADSENSE_MODE;
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  try {
    assert.equal(adsEnabledFor("/guide/x", readAdEnv()), false);
  } finally {
    process.env = saved;
  }
});

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    process.env = saved;
  }
}

const rules = async () => (await nextConfig.headers?.()) ?? [];

test("off(기본)·잘못된 값: 가이드 글 전용 CSP 규칙이 없다 (모든 경로가 같은 CSP)", async () => {
  for (const env of [
    { NEXT_PUBLIC_ADSENSE_MODE: undefined, NEXT_PUBLIC_ADSENSE_CLIENT: undefined },
    { NEXT_PUBLIC_ADSENSE_MODE: "off", NEXT_PUBLIC_ADSENSE_CLIENT: CLIENT },
    { NEXT_PUBLIC_ADSENSE_MODE: "serve", NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-bad" },
  ]) {
    const list = await withEnv(env, rules);
    // 사진 인식 업로드 화면·워커 진입 파일의 전용 CSP 는 광고와 무관하다 (tests/ocr-headers.test.ts)
    const ocr = (source: string) => source === "/app/import/photo" || source.startsWith("/_next/static/chunks/:file(");
    const cspRules = list.filter((r) => !ocr(r.source) && r.headers.some((h) => h.key === "Content-Security-Policy"));
    assert.equal(cspRules.length, 1, JSON.stringify(env));
    assert.equal(list.some((r) => r.source.startsWith("/guide")), false);
  }
});

test("광고 빌드 상수는 기본 환경에서 0 (off 빌드는 광고 단위 코드를 번들에 넣지 않는다)", () => {
  assert.equal(nextConfig.env?.MYFP_ADS_SERVE_BUILD, "0");
});

test("serve + 유효 client: /guide/:slug 에만 넓힌 CSP, 전체 규칙보다 뒤, 핵심 지시어 유지", async () => {
  const list = await withEnv({ NEXT_PUBLIC_ADSENSE_MODE: "serve", NEXT_PUBLIC_ADSENSE_CLIENT: CLIENT }, rules);
  const allIndex = list.findIndex((r) => r.source === "/:path*");
  const adIndex = list.findIndex((r) => r.source === "/guide/:slug");
  assert.ok(adIndex > allIndex && allIndex >= 0);
  const csp = list[adIndex]!.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /default-src 'self'/);
  assert.doesNotMatch(csp, /\*/, "와일드카드 출처 금지");
  assert.equal(list[adIndex]!.headers.length, 1, "CSP 외의 헤더는 바꾸지 않는다");
});
