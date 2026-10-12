// 빌드 뒤 확인: OCR 워커 진입 파일(turbopack-worker-<해시>.js)이 next.config.ts 의 워커 CSP 규칙(<경로>/:file(<정규식>))과 맞는지 본다.
// 브라우저는 워커 안의 wasm 컴파일에 워커 스크립트 응답의 CSP 를 적용한다. Next·Turbopack 을 올려 진입 파일 이름이나 서빙 경로가 바뀌면
// 워커가 전체 CSP 를 받아 OCR 만 조용히 막히므로, 여기서 원인 메시지와 함께 빌드를 실패시킨다.
// 워커 진입 파일은 Turbopack 의 모든 워커가 함께 쓰므로 워커 CSP 예외는 앞으로 생기는 모든 워커에 적용된다. 그래서 소스에서
// `new Worker(` 를 쓰는 곳이 OCR 워커 하나뿐인지도 확인한다(워커를 늘리려면 이 예외의 범위를 먼저 다시 검토한다).
//
// 산출물 위치: 어댑터가 불변 정적 자산(supportsImmutableAssets)을 켜면 청크가 <distDir>/static/immutable/chunks 로 나가고
// /_next/static/immutable/chunks/… 로 서빙된다(Vercel 빌드). 그래서 후보 폴더를 차례로 찾는다:
//   인자 → <distDir>/static/chunks → <distDir>/static/immutable/chunks → .vercel/output/static/_next/static/{chunks,immutable/chunks}
//   → 작업 폴더 아래 4단계까지(node_modules·src·.git 제외) turbopack-worker-*.js 가 있는 폴더.
// 못 찾거나, 찾은 진입 파일의 서빙 경로·이름이 헤더 규칙과 맞지 않으면 어느 환경이든 실패한다(exit 1, 보안 가드라 건너뛰지 않는다).
// 실패하면 찾아본 곳과 .next·.vercel/output 최상위 목록(최대 50줄)을 진단으로 남긴다. 실패한 Vercel 빌드는 승격되지 않아 운영은 그대로다.
// 불변 자산 빌드는 로컬에서 `npm run build:vercel-like`(scripts/dev/immutable-assets-adapter.mjs)로 재현한다.
// 사용: node scripts/check-ocr-worker.mjs [청크 폴더] [소스 폴더]. CHECK_OCR_ROOT 로 산출물을 찾을 작업 폴더를 바꿀 수 있다(시험용).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import nextConfig from "../next.config.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const root = path.resolve(process.env.CHECK_OCR_ROOT ?? repoRoot);
const explicitDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const srcDir = path.resolve(process.argv[3] ?? path.join(repoRoot, "src"));
const ENTRY = /^turbopack-worker-.+\.js$/;
const DIAGNOSTIC_LINES = 50;

const rel = (p) => path.relative(root, p) || ".";
function fail(message) {
  console.error(`[check-ocr-worker] ${message}`);
  process.exit(1);
}

// 워커 CSP 규칙: <경로>/:file(<정규식>) 형태, 경로는 청크 폴더 둘 중 하나, 정규식은 모두 같아야 한다
const ALLOWED_BASES = ["/_next/static/chunks", "/_next/static/immutable/chunks"];
const rules = (await nextConfig.headers?.()) ?? [];
const workerRules = rules.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy" && h.value.includes("'wasm-unsafe-eval'")));
const parsed = workerRules.map((r) => ({ source: r.source, m: /^(\/.+)\/:file\((.+)\)$/.exec(r.source) }));
if (parsed.length === 0 || parsed.some((p) => !p.m || !ALLOWED_BASES.includes(p.m[1]))) {
  fail(`워커 CSP 규칙의 경로 형식이 예상과 다릅니다: ${workerRules.map((r) => r.source).join(", ") || "(규칙 없음)"}. next.config.ts 를 확인하세요.`);
}
if (new Set(parsed.map((p) => p.m[2])).size !== 1) fail("워커 CSP 규칙들의 파일 이름 정규식이 서로 다릅니다.");
const coveredBases = parsed.map((p) => p.m[1]);
const pattern = new RegExp(`^(?:${parsed[0].m[2]})$`);

/** 청크 폴더 → 서빙 경로. 알 수 없으면 null */
function servedBase(dir) {
  const norm = dir.split(path.sep).join("/");
  if (norm.endsWith("/immutable/chunks")) return "/_next/static/immutable/chunks";
  if (norm.endsWith("/chunks")) return "/_next/static/chunks";
  return null;
}

function workerFilesIn(dir) {
  try {
    return readdirSync(dir).filter((f) => ENTRY.test(f) || pattern.test(f));
  } catch {
    return [];
  }
}

function deepSearch(dir, depth, out) {
  if (depth > 4) return out;
  let names = [];
  try {
    names = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  if (names.some((d) => d.isFile() && ENTRY.test(d.name))) out.push(dir);
  for (const d of names) {
    if (d.isDirectory() && !["node_modules", "src", ".git"].includes(d.name)) deepSearch(path.join(dir, d.name), depth + 1, out);
  }
  return out;
}

const distDir = path.join(root, nextConfig.distDir ?? ".next");
const vercelStatic = path.join(root, ".vercel/output/static/_next/static");
const candidates = explicitDir
  ? [explicitDir]
  : [
      path.join(distDir, "static/chunks"),
      path.join(distDir, "static/immutable/chunks"),
      path.join(vercelStatic, "chunks"),
      path.join(vercelStatic, "immutable/chunks"),
    ];
let chunksDir = candidates.find((dir) => workerFilesIn(dir).length > 0) ?? null;
if (!chunksDir && !explicitDir) chunksDir = deepSearch(root, 0, []).find((dir) => !candidates.includes(dir)) ?? null;

function diagnostics() {
  const lines = [`  VERCEL 환경변수: ${process.env.VERCEL ? "있음" : "없음"}, NEXT_ADAPTER_PATH: ${process.env.NEXT_ADAPTER_PATH ? "있음" : "없음"}`];
  for (const dir of [distDir, path.join(root, ".vercel/output")]) {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      lines.push(`  ${rel(dir)}: (없음)`);
      continue;
    }
    lines.push(`  ${rel(dir)}/: ${names.length}개`);
    for (const n of names) lines.push(`    ${n}`);
  }
  return lines.slice(0, DIAGNOSTIC_LINES).join("\n");
}

if (!chunksDir || !servedBase(chunksDir)) {
  const tried = [...candidates, ...(explicitDir ? [] : ["(작업 폴더 아래 4단계 탐색)"])].map((c) => `  - ${c.startsWith("(") ? c : rel(c)}`).join("\n");
  const reason = explicitDir && !existsSync(explicitDir) ? `청크 폴더가 없습니다: ${rel(explicitDir)} (next build 뒤에 실행하세요)` : "워커 진입 파일이 있는 청크 폴더를 찾지 못했습니다";
  const message = `${reason}\n찾아본 곳:\n${tried}\n진단(최상위 목록):\n${diagnostics()}`;
  if (explicitDir && existsSync(explicitDir)) chunksDir = explicitDir; // 명시한 폴더는 아래 이름 검사로 원인을 알린다
  else fail(message);
}

const files = readdirSync(chunksDir).filter((f) => f.endsWith(".js"));
const matched = files.filter((f) => pattern.test(f));
const workerLike = files.filter((f) => /worker/i.test(f));
const base = servedBase(chunksDir) ?? "(알 수 없음)";
if (matched.length === 0) {
  fail(
    `워커 진입 파일이 규칙(${parsed.map((p) => p.source).join(", ")})과 맞지 않습니다. Next·Turbopack 업그레이드로 이름이 바뀌었을 수 있습니다. ` +
      `이름에 worker 가 들어간 청크: ${workerLike.join(", ") || "(없음)"}. 규칙의 정규식을 새 이름에 맞추고 tests/ocr-headers.test.ts 를 갱신하세요.`,
  );
}
if (matched.length > 1) fail(`규칙과 맞는 워커 진입 파일이 ${matched.length}개입니다(${matched.join(", ")}). 워커가 늘었다면 CSP 범위를 다시 검토하세요.`);
const entry = matched[0];
if (!coveredBases.includes(base)) {
  fail(`워커 진입 파일이 ${base}/${entry} 로 서빙되는데 워커 CSP 규칙이 덮는 경로는 ${coveredBases.join(", ")} 뿐입니다. next.config.ts 의 규칙 경로를 맞추세요.`);
}

// 앱이 실제로 이 진입 파일로 워커를 띄우는지: 다른 청크 안에 이 파일 이름이 적혀 있어야 한다.
const referenced = files.some((f) => f !== entry && readFileSync(path.join(chunksDir, f), "utf8").includes(entry));
if (!referenced) fail(`워커 진입 파일 ${entry} 를 참조하는 청크가 없습니다. 워커를 띄우는 방식이 바뀌었는지 확인하세요.`);

// 소스에서 워커를 만드는 곳: 정확히 1곳이고 OCR 워커여야 한다
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|js|mjs)$/.test(name) ? [full] : [];
  });
}
const creators = walk(srcDir).flatMap((file) => (readFileSync(file, "utf8").match(/new (Shared)?Worker\s*\(/g) ?? []).map(() => file));
const ocrCreators = creators.filter((file) => /new Worker\(new URL\("[^"]*\/ocr\.worker\.ts", import\.meta\.url\)/.test(readFileSync(file, "utf8")));
if (creators.length !== 1 || ocrCreators.length !== 1) {
  fail(
    `워커를 만드는 곳은 OCR 워커 한 곳이어야 합니다(지금 ${creators.length}곳: ${creators.map((f) => path.relative(repoRoot, f)).join(", ") || "없음"}). ` +
      "워커 진입 파일의 CSP 예외(wasm 허용)가 모든 워커에 적용되므로, 워커를 늘리려면 next.config.ts 의 예외 범위를 먼저 검토하세요.",
  );
}

console.log(`[check-ocr-worker] ${rel(chunksDir)}/${entry} (${base}) 가 워커 CSP 규칙과 맞고, 워커를 만드는 곳은 OCR 워커 한 곳입니다`);
