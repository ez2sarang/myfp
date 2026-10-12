// 사진 인식(OCR) 헤더 (next.config.ts): 업로드 화면 하나에만 전용 CSP, /ocr/* 자산은 불변 캐시, 그 밖의 경로는 헤더가 그대로다.
import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../next.config.ts";

type Rule = { source: string; headers: { key: string; value: string }[] };

const UPLOAD = "/app/import/photo";
const ASSETS = "/ocr/:path*";

async function rules(): Promise<Rule[]> {
  return ((await nextConfig.headers?.()) ?? []) as Rule[];
}

// 이 설정이 쓰는 형태(/:path*, /x/:path*, /x/:slug, 정확한 경로)만 해석하는 작은 매처. 다른 형태가 생기면 시험이 실패해 알린다.
function matches(source: string, path: string): boolean {
  if (source.endsWith("/:path*")) {
    const base = source.slice(0, -"/:path*".length);
    return base === "" || path === base || path.startsWith(`${base}/`);
  }
  if (source.endsWith("/:slug")) {
    const base = source.slice(0, -"/:slug".length);
    const rest = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : "";
    return rest.length > 0 && !rest.includes("/");
  }
  assert.doesNotMatch(source, /[:*()?]/, `지원하지 않는 패턴: ${source}`);
  return source === path;
}

// 같은 키는 뒤 규칙이 앞 규칙을 덮어쓴다 (Next headers 의 동작)
function effective(list: Rule[], path: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rule of list) if (matches(rule.source, path)) for (const h of rule.headers) map.set(h.key, h.value);
  return map;
}

test("업로드 화면 전용 CSP: 전체 규칙보다 뒤, CSP 하나만 바꾸고 wasm 컴파일·같은 출처 워커만 연다", async () => {
  const list = await rules();
  const allIndex = list.findIndex((r) => r.source === "/:path*");
  const index = list.findIndex((r) => r.source === UPLOAD);
  assert.ok(index > allIndex && allIndex >= 0);
  assert.equal(list[index]!.headers.length, 1, "CSP 외의 헤더는 바꾸지 않는다");
  const csp = list[index]!.headers[0]!;
  assert.equal(csp.key, "Content-Security-Policy");
  const directives = new Map(csp.value.split("; ").map((d) => [d.split(" ")[0]!, d]));
  assert.equal(directives.get("script-src"), "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
  assert.equal(directives.get("worker-src"), "worker-src 'self' blob:");
  assert.equal(directives.get("connect-src"), "connect-src 'self'", "사진·결과를 외부로 보내지 못하게 같은 출처만");
  assert.equal(directives.get("img-src"), "img-src 'self' data: blob:");
  assert.equal(directives.get("default-src"), "default-src 'self'");
  assert.equal(directives.get("object-src"), "object-src 'none'");
  assert.equal(directives.get("base-uri"), "base-uri 'self'");
  assert.equal(directives.get("frame-ancestors"), "frame-ancestors 'none'");
  assert.doesNotMatch(csp.value, /\*/, "와일드카드 출처 금지");
  assert.doesNotMatch(csp.value, /'unsafe-eval'/);
});

test("다른 경로의 헤더는 OCR 규칙이 없을 때와 같다 (전체 CSP 에 wasm·워커 지시어 없음)", async () => {
  const list = await rules();
  const without = list.filter((r) => r.source !== UPLOAD && r.source !== ASSETS);
  assert.equal(list.length - without.length, 2);
  for (const path of ["/", "/login", "/app", "/app/import", "/app/import/photos", "/app/import/photo/x", "/app/share", "/s/abc", "/join/abc", "/guide/abc", "/_next/static/chunks/a.js", "/ocrx"]) {
    assert.deepEqual(effective(list, path), effective(without, path), path);
  }
  const global = effective(list, "/app").get("Content-Security-Policy") ?? "";
  assert.doesNotMatch(global, /wasm-unsafe-eval|worker-src/);
  assert.notEqual(effective(list, UPLOAD).get("Content-Security-Policy"), global);
  // 업로드 화면도 CSP 외의 보안 헤더는 전체 규칙 그대로
  const upload = effective(list, UPLOAD);
  const app = effective(list, "/app");
  for (const key of ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy"]) {
    assert.equal(upload.get(key), app.get(key), key);
  }
});

test("/ocr/* 자산은 1년 불변 캐시, 다른 경로에는 Cache-Control 을 붙이지 않는다", async () => {
  const list = await rules();
  const rule = list.find((r) => r.source === ASSETS);
  assert.ok(rule);
  assert.deepEqual(rule.headers, [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
  assert.equal(effective(list, "/ocr/models/a.onnx").get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(effective(list, "/ocr/models/a.onnx").get("Content-Security-Policy"), effective(list, "/").get("Content-Security-Policy"));
  assert.equal(effective(list, UPLOAD).has("Cache-Control"), false);
  assert.equal(effective(list, "/app").has("Cache-Control"), false);
});
