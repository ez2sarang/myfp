// 사진 등록 화면 계약(소스 검사): 사진·인식 결과를 서버로 보내거나 저장소에 남기지 않고, 서버로는 등록 JSON 만 보낸다.
// 워커 생성 형태는 Turbopack 워커 진입 파일과 그 CSP 확인(scripts/check-ocr-worker.mjs)이 기대하는 모양 그대로다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { root } from "./source-contract-helpers.ts";

const read = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/^\s*\/\/.*$/gm, "");
const UI = read("src/components/import/photo-import.tsx");

test("사진 File·Blob 을 네트워크로 보내지 않고, 브라우저 저장소에 남기지 않는다", () => {
  assert.doesNotMatch(UI, /\bfetch\(|FormData|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(UI, /localStorage|sessionStorage|indexedDB|caches\.open|document\.cookie/);
  // 서버로 가는 것은 등록 JSON 하나뿐
  assert.deepEqual(UI.match(/registerImportAction\([^)]*\)/g), ["registerImportAction(out.payload)"]);
  // 원본 File 은 준비(방향 보정·축소)에만 쓰고, 워커로는 ImageBitmap 을 transfer 한다
  assert.match(UI, /prepareBitmap\(file\)/);
  assert.match(UI, /postMessage\(\{ type: "run", id: next\.id, bitmap \}, \[bitmap\]\)/);
});

test("사진 수·크기 상한과 워커 생성 형태", () => {
  assert.match(UI, /const MAX_PHOTOS = 10;/);
  assert.match(UI, /const MAX_BYTES = 20 \* 1024 \* 1024;/);
  assert.match(UI, /new Worker\(new URL\("\.\.\/\.\.\/lib\/ocr\/ocr\.worker\.ts", import\.meta\.url\), \{ type: "module" \}\)/);
});

test("사진 위 주의 줄은 photoNotices 로만: 실제 적용 레이아웃(자동이면 판정값, 아니면 사용자 선택)과 그 사진의 후보를 넘긴다", () => {
  assert.match(UI, /photoNotices\(p\.layout === "auto" \? detected : p\.layout, candidates\.filter\(\(c\) => c\.capture === done\.indexOf\(p\)\)\)/);
  assert.match(UI, /const detected = p\.status === "done" \? detectLayout\(/);
  // 문구는 rows.ts 한 곳에만 있고 화면에 따로 적지 않는다(손글씨가 아닐 때 나올 길이 없다)
  assert.doesNotMatch(UI, /손글씨는 인식이 부정확|적어 둔 합계/);
  assert.match(UI, /\{notices\.map\(\(n\) => \(\s*<p key=\{n\} className="[^"]*bg-warn-bg[^"]*text-warn-ink/);
});

test("진입점 3곳(대시보드·예정지출 탭·자산 화면)에 「사진으로 추가」", () => {
  for (const file of ["src/app/app/page.tsx", "src/components/monthly/planned-tab.tsx", "src/app/app/assets/page.tsx"]) {
    assert.match(read(file), /href="\/app\/import\/photo"[\s\S]{0,200}사진으로 추가/, file);
  }
});
