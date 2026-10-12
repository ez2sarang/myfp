// onnxruntime-web 의 wasm 을 node_modules(정확 버전)에서 public/ocr/ort/ 로 복사한다(빌드·개발 전에 명시적으로 실행).
// 복사본은 저장소에 넣지 않고(.gitignore), 커밋된 해시 매니페스트(src/lib/ocr/ocr-models.json)와 버전·크기·SHA-256 이 맞을 때만 쓴다.
// 다르면 실패해 빌드를 멈춘다. npm 의 pre/post 훅에 의존하지 않는다(--ignore-scripts 환경에서도 같은 동작).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "src/lib/ocr/ocr-models.json"), "utf8"));
const { ort } = manifest;

const pkg = JSON.parse(readFileSync(path.join(root, "node_modules", ort.package, "package.json"), "utf8"));
if (pkg.version !== ort.version) {
  console.error(`[copy-ort] ${ort.package} 버전 불일치: 설치 ${pkg.version}, 매니페스트 ${ort.version}`);
  process.exit(1);
}

const bytes = readFileSync(path.join(root, ort.wasm.from));
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (bytes.length !== ort.wasm.bytes || sha256 !== ort.wasm.sha256) {
  console.error(`[copy-ort] wasm 해시 불일치: ${bytes.length} ${sha256}`);
  process.exit(1);
}
const dest = path.join(root, "public", ort.wasm.file);
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, bytes);
console.log(`[copy-ort] ${ort.wasm.file} (${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}…)`);
