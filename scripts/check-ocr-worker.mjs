// 빌드 뒤 확인: OCR 워커 진입 파일이 next.config.ts 의 워커 CSP 규칙(/_next/static/chunks/:file(<정규식>))과 맞는지 본다.
// 브라우저는 워커 안의 wasm 컴파일에 워커 스크립트 응답의 CSP 를 적용한다. Next·Turbopack 을 올려 진입 파일 이름이 바뀌면
// 워커가 전체 CSP 를 받아 OCR 만 조용히 막히므로, 여기서 원인 메시지와 함께 빌드를 실패시킨다.
// 워커 진입 파일은 Turbopack 의 모든 워커가 함께 쓰므로 워커 CSP 예외는 앞으로 생기는 모든 워커에 적용된다. 그래서 소스에서
// `new Worker(` 를 쓰는 곳이 OCR 워커 하나뿐인지도 확인한다(워커를 늘리려면 이 예외의 범위를 먼저 다시 검토한다).
// 사용: node scripts/check-ocr-worker.mjs [청크 폴더] [소스 폴더] (기본 .next/static/chunks, src). npm 훅에 의존하지 않고 build 스크립트에서 명시적으로 부른다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import nextConfig from "../next.config.ts";

const root = path.resolve(import.meta.dirname, "..");
const chunksDir = path.resolve(process.argv[2] ?? path.join(root, ".next/static/chunks"));
const srcDir = path.resolve(process.argv[3] ?? path.join(root, "src"));

function fail(message) {
  console.error(`[check-ocr-worker] ${message}`);
  process.exit(1);
}

const rules = (await nextConfig.headers?.()) ?? [];
const workerRules = rules.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy" && h.value.includes("'wasm-unsafe-eval'")));
if (workerRules.length !== 1) fail(`wasm 을 여는 CSP 규칙은 정확히 1개여야 합니다(지금 ${workerRules.length}개). next.config.ts 를 확인하세요.`);
const source = workerRules[0].source;
const match = /^\/_next\/static\/chunks\/:file\((.+)\)$/.exec(source);
if (!match) fail(`워커 CSP 규칙의 경로 형식이 예상과 다릅니다: ${source}`);
const pattern = new RegExp(`^(?:${match[1]})$`);

if (!existsSync(chunksDir)) fail(`청크 폴더가 없습니다: ${path.relative(root, chunksDir) || chunksDir} (next build 뒤에 실행하세요)`);
const files = readdirSync(chunksDir).filter((f) => f.endsWith(".js"));
const matched = files.filter((f) => pattern.test(f));
const workerLike = files.filter((f) => /worker/i.test(f));
if (matched.length === 0) {
  fail(
    `워커 진입 파일이 규칙(${source})과 맞지 않습니다. Next·Turbopack 업그레이드로 이름이 바뀌었을 수 있습니다. ` +
      `이름에 worker 가 들어간 청크: ${workerLike.join(", ") || "(없음)"}. 규칙의 정규식을 새 이름에 맞추고 tests/ocr-headers.test.ts 를 갱신하세요.`,
  );
}
if (matched.length > 1) fail(`규칙과 맞는 워커 진입 파일이 ${matched.length}개입니다(${matched.join(", ")}). 워커가 늘었다면 CSP 범위를 다시 검토하세요.`);

// 앱이 실제로 이 진입 파일로 워커를 띄우는지: 다른 청크 안에 이 파일 경로가 적혀 있어야 한다.
const entry = matched[0];
const referenced = files.some((f) => f !== entry && readFileSync(path.join(chunksDir, f), "utf8").includes(`static/chunks/${entry}`));
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
    `워커를 만드는 곳은 OCR 워커 한 곳이어야 합니다(지금 ${creators.length}곳: ${creators.map((f) => path.relative(root, f)).join(", ") || "없음"}). ` +
      "워커 진입 파일의 CSP 예외(wasm 허용)가 모든 워커에 적용되므로, 워커를 늘리려면 next.config.ts 의 예외 범위를 먼저 검토하세요.",
  );
}

console.log(`[check-ocr-worker] ${entry} 가 워커 CSP 규칙과 맞고, 워커를 만드는 곳은 OCR 워커 한 곳입니다`);
