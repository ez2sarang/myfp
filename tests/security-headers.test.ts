// 보안 응답 헤더 (next.config.ts): 모든 경로 + 공유 보기 전용 헤더.
import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../next.config.ts";

async function rules() {
  return (await nextConfig.headers?.()) ?? [];
}

test("모든 경로에 CSP 와 보안 헤더가 붙는다", async () => {
  const all = (await rules()).find((r) => r.source === "/:path*");
  assert.ok(all);
  const map = new Map(all.headers.map((h) => [h.key, h.value]));
  const csp = map.get("Content-Security-Policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.doesNotMatch(csp, /\*(?!\.)/, "와일드카드 출처 금지");
  assert.equal(map.get("X-Frame-Options"), "DENY");
  assert.equal(map.get("X-Content-Type-Options"), "nosniff");
  assert.equal(map.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.match(map.get("Permissions-Policy") ?? "", /camera=\(\)/);
  assert.match(map.get("Strict-Transport-Security") ?? "", /^max-age=\d{7,}$/);
  assert.equal(nextConfig.poweredByHeader, false);
});

test("공유 보기(/s/*)는 noindex·no-store·no-referrer 이고 전체 규칙보다 뒤에 있어 Referrer-Policy 를 덮어쓴다", async () => {
  const list = await rules();
  const allIndex = list.findIndex((r) => r.source === "/:path*");
  const shareIndex = list.findIndex((r) => r.source === "/s/:path*");
  assert.ok(shareIndex > allIndex && allIndex >= 0);
  const map = new Map(list[shareIndex]!.headers.map((h) => [h.key, h.value]));
  assert.match(map.get("X-Robots-Tag") ?? "", /noindex/);
  assert.match(map.get("X-Robots-Tag") ?? "", /nofollow/);
  assert.match(map.get("Cache-Control") ?? "", /no-store/);
  assert.equal(map.get("Referrer-Policy"), "no-referrer");
});
