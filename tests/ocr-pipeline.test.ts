// 사진 인식(OCR) 전·후처리 순수 함수 (RapidOCR 3.9.2 Python 구현 이식). 모델 없이 합성 이미지·가짜 모델 출력만 쓴다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ctcDecode,
  ctcLabels,
  detInputSize,
  fitWithin,
  normalizeChw,
  recTensor,
  resizeBilinear,
  rgbaToBgr,
  runOcr,
  type Image3,
  type OcrModels,
} from "../src/lib/ocr/pipeline.ts";

function solid(width: number, height: number, bgr: [number, number, number]): Image3 {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) data.set(bgr, i * 3);
  return { width, height, data };
}

test("fitWithin: 긴 변 1280 을 넘으면 비율 유지 축소, 넘지 않으면 그대로", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 960, height: 1280 });
  assert.deepEqual(fitWithin(1280, 720), { width: 1280, height: 720 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(10000, 5), { width: 1280, height: 1 }, "한 변이 0 이 되지 않는다");
});

test("detInputSize: 짧은 변이 736 보다 작으면 키우고(limit_type=min), 양 변을 32 배수로", () => {
  assert.deepEqual(detInputSize(1280, 960), { width: 1280, height: 960 });
  assert.deepEqual(detInputSize(200, 100), { width: 1472, height: 736 });
  assert.deepEqual(detInputSize(1000, 1000), { width: 992, height: 992 });
  for (const [w, h] of [[1280, 853], [777, 1280], [33, 900]] as const) {
    const s = detInputSize(w, h);
    assert.equal(s.width % 32, 0);
    assert.equal(s.height % 32, 0);
    assert.ok(Math.min(s.width, s.height) >= 736 - 16, `${w}x${h}`);
  }
});

test("rgbaToBgr·normalizeChw: 채널 순서 BGR, CHW 배치, (x/255−0.5)/0.5, 남는 너비는 0", () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]); // 빨강, 파랑 (1행 2열)
  const bgr = rgbaToBgr(rgba, 2, 1);
  assert.deepEqual([...bgr.data], [0, 0, 255, 255, 0, 0]);
  const chw = normalizeChw(bgr, 3);
  // 채널 B: [-1, 1, 0(채움)], G: [-1, -1, 0], R: [1, -1, 0]
  assert.deepEqual([...chw], [-1, 1, 0, -1, -1, 0, 1, -1, 0]);
});

test("resizeBilinear: 단색은 단색 그대로, 2배 확대는 이웃 평균(반화소 중심)", () => {
  const out = resizeBilinear(solid(3, 2, [10, 20, 30]), 7, 5);
  assert.equal(out.data.length, 7 * 5 * 3);
  for (let i = 0; i < out.data.length; i += 3) assert.deepEqual([...out.data.subarray(i, i + 3)], [10, 20, 30]);
  const ramp: Image3 = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 100, 100, 100]) };
  const up = resizeBilinear(ramp, 4, 1);
  assert.deepEqual([...up.data].filter((_, i) => i % 3 === 0), [0, 25, 75, 100]);
});

test("recTensor: 높이 48, 비율대로 너비, 묶음 너비까지 0 채움", () => {
  const crop = solid(100, 20, [255, 255, 255]); // 비율 5 → 너비 240
  const t = recTensor(crop, 320);
  assert.equal(t.length, 3 * 48 * 320);
  assert.equal(t[47 * 320 + 239], 1);
  assert.equal(t[47 * 320 + 240], 0);
});

test("CTC: 연속 중복·blank 제거, 점수는 남은 글자 확률 평균(소수 5자리)", () => {
  const labels = ctcLabels("가\n1\n원");
  assert.deepEqual(labels, ["blank", "가", "1", "원", " "]);
  const steps = [1, 1, 0, 2, 0, 2, 2, 3, 4, 0];
  const probs = new Float32Array(steps.length * labels.length).fill(0.01);
  const p = [0.9, 0.7, 0.99, 0.8, 0.95, 0.6, 0.5, 0.85, 0.75, 0.99];
  steps.forEach((c, t) => (probs[t * labels.length + c] = p[t]!));
  const out = ctcDecode(probs, steps.length, labels.length, labels);
  assert.equal(out.text, "가11원 ");
  const kept = [0.9, 0.8, 0.6, 0.85, 0.75].map((v) => Math.round(Math.fround(v) * 1e5) / 1e5);
  assert.equal(out.score, Math.round((kept.reduce((s, v) => s + v, 0) / kept.length) * 1e5) / 1e5);
  assert.deepEqual(ctcDecode(new Float32Array(3 * 5), 3, 5, labels), { text: "", score: 0 }, "전부 blank");
});

test("runOcr: 합성 이미지의 검은 띠 하나 → 상자 하나, 가짜 인식 출력이 글자로, 점수 0.5 미만은 버린다", async () => {
  const img = solid(200, 100, [255, 255, 255]);
  for (let y = 40; y < 60; y += 1) for (let x = 40; x < 160; x += 1) img.data.set([0, 0, 0], (y * 200 + x) * 3);
  const labels = ctcLabels("가\n1\n원");
  const fake = (score: number): OcrModels => ({
    async det(input, width, height) {
      const prob = new Float32Array(width * height);
      for (let i = 0; i < prob.length; i += 1) prob[i] = (input[i] as number) < 0 ? 1 : 0; // 어두운 화소 = 글자
      return prob;
    },
    async rec(_input, count) {
      const steps = 4;
      const data = new Float32Array(count * steps * labels.length);
      for (let n = 0; n < count; n += 1) [1, 0, 2, 2].forEach((c, t) => (data[(n * steps + t) * labels.length + c] = score));
      return { data, steps, classes: labels.length };
    },
  });
  const lines = await runOcr(img, fake(0.9), labels);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.text, "가1");
  assert.equal(lines[0]!.score, 0.9);
  const xs = lines[0]!.box.map((p) => p[0]);
  const ys = lines[0]!.box.map((p) => p[1]);
  assert.ok(Math.min(...xs) <= 40 && Math.max(...xs) >= 159 && Math.min(...xs) >= 0 && Math.max(...xs) <= 199, `x ${xs}`);
  assert.ok(Math.min(...ys) <= 40 && Math.max(...ys) >= 59 && Math.min(...ys) >= 0 && Math.max(...ys) <= 99, `y ${ys}`);
  assert.deepEqual(await runOcr(img, fake(0.4), labels), []);
  assert.deepEqual(await runOcr(solid(200, 100, [255, 255, 255]), fake(0.9), labels), [], "글자 없는 사진");
});
