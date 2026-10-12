// 사진 인식(OCR) 헤더 (next.config.ts): 업로드 화면은 전체 CSP 보다 좁게만, wasm 은 워커 진입 파일 한 경로에만,
// /ocr/* 자산은 불변 캐시, 그 밖의 경로는 헤더가 그대로다. 워커 진입 파일 경로가 "업로드 화면 밖 헤더 불변"의 유일한 예외다.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import nextConfig from "../next.config.ts";
import { root } from "./source-contract-helpers.ts";

type Rule = { source: string; headers: { key: string; value: string }[] };

const UPLOAD = "/app/import/photo";
const ASSETS = "/ocr/:path*";
const WORKER = "/_next/static/chunks/:file(turbopack-worker-[^/]+\\.js)";
const WORKER_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const OCR_SOURCES = [UPLOAD, ASSETS, WORKER];

async function rules(): Promise<Rule[]> {
  return ((await nextConfig.headers?.()) ?? []) as Rule[];
}

// 이 설정이 쓰는 형태(/:path*, /x/:path*, /x/:slug, /x/:file(정규식), 정확한 경로)만 해석하는 작은 매처. 다른 형태가 생기면 시험이 실패해 알린다.
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
  const param = /^(.*)\/:file\((.+)\)$/.exec(source);
  if (param) {
    const [, base, pattern] = param as unknown as [string, string, string];
    return path.startsWith(`${base}/`) && new RegExp(`^(?:${pattern})$`).test(path.slice(base.length + 1));
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

function directives(csp: string): Map<string, string> {
  return new Map(csp.split("; ").map((d) => [d.split(" ")[0]!, d]));
}

test("업로드 화면 CSP: 전체 규칙보다 뒤, CSP 하나만, 전체보다 좁게만(wasm·blob·https 이미지 없음)", async () => {
  const list = await rules();
  const allIndex = list.findIndex((r) => r.source === "/:path*");
  const index = list.findIndex((r) => r.source === UPLOAD);
  assert.ok(index > allIndex && allIndex >= 0);
  assert.equal(list[index]!.headers.length, 1, "CSP 외의 헤더는 바꾸지 않는다");
  const csp = list[index]!.headers[0]!;
  assert.equal(csp.key, "Content-Security-Policy");
  const d = directives(csp.value);
  assert.equal(d.get("script-src"), "script-src 'self' 'unsafe-inline'");
  assert.equal(d.get("worker-src"), "worker-src 'self'");
  assert.equal(d.get("connect-src"), "connect-src 'self'", "사진·결과를 외부로 보내지 못하게 같은 출처만");
  assert.equal(d.get("img-src"), "img-src 'self' data: blob:");
  assert.equal(d.get("default-src"), "default-src 'self'");
  assert.equal(d.get("object-src"), "object-src 'none'");
  assert.equal(d.get("base-uri"), "base-uri 'self'");
  assert.equal(d.get("frame-ancestors"), "frame-ancestors 'none'");
  assert.doesNotMatch(csp.value, /wasm-unsafe-eval|'unsafe-eval'|\*/);
  assert.doesNotMatch(d.get("worker-src")!, /blob:/);
  // 전체 CSP 에 없는 출처를 더하지 않는다 (지시어별 출처가 전체 CSP 의 같은 지시어(없으면 default-src)의 부분집합)
  const global = directives(effective(list, "/app").get("Content-Security-Policy") ?? "");
  for (const [name, value] of d) {
    const base = (global.get(name) ?? global.get("script-src") ?? "").split(" ").slice(1);
    for (const src of value.split(" ").slice(1)) assert.ok(base.includes(src), `${name} ${src}`);
  }
});

test("워커 진입 파일 한 경로에만 워커 전용 CSP: wasm 컴파일만 열고 'unsafe-inline'·'unsafe-eval'·blob 없음", async () => {
  const list = await rules();
  const allIndex = list.findIndex((r) => r.source === "/:path*");
  const index = list.findIndex((r) => r.source === WORKER);
  assert.ok(index > allIndex && allIndex >= 0);
  assert.deepEqual(list[index]!.headers, [{ key: "Content-Security-Policy", value: WORKER_CSP }]);
  assert.doesNotMatch(WORKER_CSP, /'unsafe-inline'|'unsafe-eval'|blob:|https:|\*/);
  // wasm 을 여는 규칙은 이것 하나뿐
  const wasmRules = list.filter((r) => r.headers.some((h) => h.value.includes("wasm-unsafe-eval")));
  assert.deepEqual(wasmRules.map((r) => r.source), [WORKER]);
  for (const name of ["turbopack-worker-2ru9m5gbh1na6.js", "turbopack-worker-a_b-c.js"]) {
    assert.equal(effective(list, `/_next/static/chunks/${name}`).get("Content-Security-Policy"), WORKER_CSP, name);
  }
});

test("다른 경로의 헤더는 OCR 규칙이 없을 때와 같다 (/_next/static 의 다른 파일·페이지·API 포함)", async () => {
  const list = await rules();
  const without = list.filter((r) => !OCR_SOURCES.includes(r.source));
  assert.equal(list.length - without.length, OCR_SOURCES.length);
  const paths = [
    "/", "/login", "/app", "/app/import", "/app/import/photos", "/app/import/photo/x", "/app/share", "/s/abc", "/join/abc", "/guide/abc",
    "/api/health", "/api/auth/session", "/ocrx",
    "/_next/static/chunks/a.js", "/_next/static/chunks/turbopack-1yuwv6457b8y0.js", "/_next/static/chunks/turbopack-worker-a.js.map",
    "/_next/static/chunks/sub/turbopack-worker-a.js", "/_next/static/chunks/xturbopack-worker-a.js", "/_next/static/media/turbopack-worker-a.js",
    "/_next/static/media/ort-wasm-simd-threaded.38dh_vup27riw.wasm", "/_next/static/css/a.css",
  ];
  for (const path of paths) assert.deepEqual(effective(list, path), effective(without, path), path);
  const global = effective(list, "/app").get("Content-Security-Policy") ?? "";
  assert.doesNotMatch(global, /wasm-unsafe-eval|worker-src/);
  // 업로드 화면도 CSP 외의 보안 헤더는 전체 규칙 그대로
  const upload = effective(list, UPLOAD);
  const app = effective(list, "/app");
  for (const key of ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy"]) {
    assert.equal(upload.get(key), app.get(key), key);
  }
});

test("/ocr/* 자산은 1년 불변 캐시(private, 공유 캐시 제외), 다른 경로에는 Cache-Control 을 붙이지 않는다", async () => {
  const list = await rules();
  const rule = list.find((r) => r.source === ASSETS);
  assert.ok(rule);
  assert.deepEqual(rule.headers, [{ key: "Cache-Control", value: "private, max-age=31536000, immutable" }]);
  assert.equal(effective(list, "/ocr/models/a.onnx").get("Cache-Control"), "private, max-age=31536000, immutable");
  assert.equal(effective(list, "/ocr/models/a.onnx").get("Content-Security-Policy"), effective(list, "/").get("Content-Security-Policy"));
  assert.equal(effective(list, UPLOAD).has("Cache-Control"), false);
  assert.equal(effective(list, "/app").has("Cache-Control"), false);
});

function checkWorker(files: Record<string, string> | null, srcFiles?: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "myfp-ocr-worker-"));
  try {
    const chunks = path.join(dir, "chunks");
    if (files) {
      spawnSync("mkdir", [chunks]);
      for (const [name, body] of Object.entries(files)) writeFileSync(path.join(chunks, name), body);
    }
    const args = [path.join(root, "scripts/check-ocr-worker.mjs"), chunks];
    if (srcFiles) {
      const src = path.join(dir, "src");
      spawnSync("mkdir", [src]);
      for (const [name, body] of Object.entries(srcFiles)) writeFileSync(path.join(src, name), body);
      args.push(src);
    }
    const out = spawnSync(process.execPath, args, { encoding: "utf8" });
    return { status: out.status, output: `${out.stdout}${out.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("빌드 뒤 확인: 진입 파일이 규칙과 맞고 앱이 참조할 때만 통과, 이름이 바뀌거나 여러 개·미참조·폴더 없음이면 실패", () => {
  const page = (entry: string) => `x("static/chunks/${entry}",["static/chunks/1.js"])`;
  assert.equal(checkWorker({ "turbopack-worker-abc123.js": "w", "41-page.js": page("turbopack-worker-abc123.js") }).status, 0);
  const renamed = checkWorker({ "worker-entry-abc123.js": "w", "41-page.js": page("worker-entry-abc123.js") });
  assert.equal(renamed.status, 1);
  assert.match(renamed.output, /이름이 바뀌었을 수/);
  assert.match(renamed.output, /worker-entry-abc123\.js/);
  const two = checkWorker({ "turbopack-worker-a.js": "w", "turbopack-worker-b.js": "w", "p.js": page("turbopack-worker-a.js") });
  assert.equal(two.status, 1);
  assert.match(two.output, /2개/);
  const orphan = checkWorker({ "turbopack-worker-abc123.js": "w", "41-page.js": "no reference" });
  assert.equal(orphan.status, 1);
  assert.match(orphan.output, /참조하는 청크가 없습니다/);
  const missing = checkWorker(null);
  assert.equal(missing.status, 1);
  assert.match(missing.output, /청크 폴더가 없습니다/);
});

test("빌드 뒤 확인: 워커 CSP 예외는 모든 Turbopack 워커에 적용되므로 소스에서 워커를 만드는 곳은 OCR 워커 한 곳뿐이어야 한다", () => {
  const chunks = { "turbopack-worker-abc123.js": "w", "41-page.js": `x("static/chunks/turbopack-worker-abc123.js")` };
  const ocr = `const w = new Worker(new URL("../../lib/ocr/ocr.worker.ts", import.meta.url), { type: "module" });`;
  assert.equal(checkWorker(chunks, { "a.tsx": ocr }).status, 0);
  const two = checkWorker(chunks, { "a.tsx": ocr, "b.ts": `new Worker(new URL("./other.worker.ts", import.meta.url));` });
  assert.equal(two.status, 1);
  assert.match(two.output, /OCR 워커 한 곳이어야 합니다\(지금 2곳/);
  assert.equal(checkWorker(chunks, { "b.ts": `new Worker(new URL("./other.worker.ts", import.meta.url));` }).status, 1, "OCR 워커가 아닌 워커");
});
