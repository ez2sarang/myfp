// 사진 인식(OCR) 자산 무결성: 크기·SHA-256 이 매니페스트와 다르면 세션을 만들지 않는다. 같은 출처 경로만 받는다. (합성 바이트만 사용)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createVerifiedSession, fetchVerified, IntegrityError, isSameOriginPath, sha256Hex, type AssetSpec, type Fetcher } from "../src/lib/ocr/integrity.ts";

const BYTES = new Uint8Array(Array.from({ length: 1000 }, (_, i) => (i * 37) % 256));
const SPEC: AssetSpec = { file: "/ocr/models/fake.onnx", bytes: BYTES.length, sha256: createHash("sha256").update(BYTES).digest("hex") };

function serve(bytes: Uint8Array, status = 200): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => bytes.slice().buffer };
  };
  return { fetcher, calls };
}

test("sha256Hex 는 node:crypto 와 같은 값", async () => {
  assert.equal(await sha256Hex(BYTES), SPEC.sha256);
  assert.equal(await sha256Hex(BYTES.slice().buffer), SPEC.sha256);
});

test("크기·해시가 맞으면 확인한 바이트로 세션을 만든다", async () => {
  const { fetcher, calls } = serve(BYTES);
  let created: Uint8Array | null = null;
  const session = await createVerifiedSession(SPEC, fetcher, async (bytes) => {
    created = bytes;
    return "session";
  });
  assert.equal(session, "session");
  assert.deepEqual(calls, [SPEC.file]);
  assert.deepEqual(created, BYTES);
});

test("해시 불일치(한 바이트 변조)·크기 불일치·받기 실패면 세션을 만들지 않는다", async () => {
  const tampered = BYTES.slice();
  tampered[500] = (tampered[500]! + 1) % 256;
  const cases: [string, Uint8Array, number][] = [
    ["해시", tampered, 200],
    ["크기", BYTES.slice(0, 999), 200],
    ["상태", BYTES, 404],
  ];
  for (const [name, bytes, status] of cases) {
    let created = 0;
    await assert.rejects(
      createVerifiedSession(SPEC, serve(bytes, status).fetcher, async () => {
        created += 1;
        return "session";
      }),
      IntegrityError,
      name,
    );
    assert.equal(created, 0, name);
  }
});

test("같은 출처 경로가 아니면 받지도 않는다", async () => {
  for (const file of ["https://cdn.example.com/a.onnx", "//cdn.example.com/a.onnx", "ocr/a.onnx", "/ocr/../a.onnx", "data:application/octet-stream,AA"]) {
    assert.equal(isSameOriginPath(file), false, file);
    const { fetcher, calls } = serve(BYTES);
    await assert.rejects(fetchVerified({ ...SPEC, file }, fetcher), IntegrityError, file);
    assert.equal(calls.length, 0, file);
  }
  assert.equal(isSameOriginPath("/ocr/models/a.onnx"), true);
});

test("매니페스트: 모든 자산이 /ocr/ 아래, 파일명에 SHA-256 앞 8자리(불변 캐시), 커밋된 모델·사전은 크기·해시 일치", () => {
  const manifest = JSON.parse(readFileSync(new URL("../src/lib/ocr/ocr-models.json", import.meta.url), "utf8"));
  const specs: AssetSpec[] = [manifest.models.det, manifest.models.rec, manifest.models.dict, manifest.ort.wasm];
  for (const spec of specs) {
    assert.match(spec.file, /^\/ocr\/(models|ort)\/[a-z0-9-]+\.[0-9a-f]{8}\.(onnx|txt|wasm)$/, spec.file);
    assert.match(spec.sha256, /^[0-9a-f]{64}$/);
    assert.ok(spec.file.includes(`.${spec.sha256.slice(0, 8)}.`), spec.file);
  }
  for (const spec of [manifest.models.det, manifest.models.rec, manifest.models.dict] as AssetSpec[]) {
    const bytes = readFileSync(new URL(`../public${spec.file}`, import.meta.url));
    assert.equal(bytes.length, spec.bytes, spec.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), spec.sha256, spec.file);
  }
  const dict = readFileSync(new URL(`../public${manifest.models.dict.file}`, import.meta.url), "utf8");
  assert.equal(dict.split("\n").length, manifest.models.dict.count);
  assert.equal(manifest.ort.version, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).dependencies["onnxruntime-web"]);
});

test("워커는 wasmPaths 를 설정하지 않고(번들 내장 글루 + 확인한 wasmBinary 만), public/ocr/ort 에는 매니페스트의 wasm 말고 아무것도 없다", () => {
  // wasmPaths 접두사를 주면 ORT 가 <접두사>/ort-wasm-simd-threaded.mjs 를 동적으로 불러온다 — 확인하지 않은 스크립트가 워커에서 돈다
  const worker = readFileSync(new URL("../src/lib/ocr/ocr.worker.ts", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(worker, /wasmPaths/);
  assert.match(worker, /ort\.env\.wasm\.wasmBinary = wasm;/);
  const manifest = JSON.parse(readFileSync(new URL("../src/lib/ocr/ocr-models.json", import.meta.url), "utf8"));
  const dir = new URL("../public/ocr/ort/", import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir) : [];
  assert.ok(files.every((f) => `/ocr/ort/${f}` === manifest.ort.wasm.file), files.join(", "));
  assert.ok(!files.some((f) => f.endsWith(".mjs") || f.endsWith(".js")));
  // 복사 스크립트도 매니페스트의 wasm 한 파일만 쓴다
  const copy = readFileSync(new URL("../scripts/copy-ort.mjs", import.meta.url), "utf8");
  assert.equal((copy.match(/writeFileSync\(/g) ?? []).length, 1);
  assert.doesNotMatch(copy, /\.mjs["']/);
});
