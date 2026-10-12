/// <reference lib="webworker" />
// OCR 워커: 업로드 화면에서만 지연 로딩한다. 모델·사전·wasm 은 같은 출처(/ocr/*)에서 받아 SHA-256 을 확인한 뒤에만 쓴다(CDN 없음).
// 입력은 메인 스레드가 다시 그린 ImageBitmap(EXIF·GPS 없음, 긴 변 1280 이하)뿐이고, 결과(글자·점수·상자)는 메인 스레드로만 돌려준다.
// 이 워커는 네트워크로 아무것도 보내지 않는다(받기만).
import * as ort from "onnxruntime-web/wasm";
import { createVerifiedSession, fetchVerified, type Fetcher } from "./integrity.ts";
import manifest from "./ocr-models.json";
import { ctcLabels, rgbaToBgr, runOcr, type OcrModels } from "./pipeline.ts";

type Request = { type: "run"; id: number; bitmap: ImageBitmap };
type Reply =
  | { type: "progress"; id: number; stage: "loading" | "recognizing" }
  | { type: "result"; id: number; lines: { text: string; score: number; box: [number, number][] }[]; width: number; height: number }
  | { type: "error"; id: number; message: string };

const fetcher: Fetcher = (url) => fetch(url, { credentials: "same-origin", cache: "force-cache" });

let ready: Promise<{ models: OcrModels; labels: string[] }> | null = null;

async function load() {
  const wasm = await fetchVerified(manifest.ort.wasm, fetcher);
  // 확인한 wasm 바이트만 넘긴다. wasmPaths 는 설정하지 않는다: 접두사를 주면 ORT 가 번들에 든 JS 글루 대신
  // <접두사>/ort-wasm-simd-threaded.mjs 를 동적으로 불러오는데, 그 파일은 매니페스트로 확인하지 않은 스크립트라 두지 않는다.
  ort.env.wasm.wasmBinary = wasm;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const options: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
  const [det, rec, dict] = await Promise.all([
    createVerifiedSession(manifest.models.det, fetcher, (bytes) => ort.InferenceSession.create(bytes, options)),
    createVerifiedSession(manifest.models.rec, fetcher, (bytes) => ort.InferenceSession.create(bytes, options)),
    fetchVerified(manifest.models.dict, fetcher),
  ]);
  const labels = ctcLabels(new TextDecoder().decode(dict));
  const models: OcrModels = {
    async det(input, width, height) {
      const out = await det.run({ [det.inputNames[0] as string]: new ort.Tensor("float32", input, [1, 3, height, width]) });
      return (out[det.outputNames[0] as string] as ort.Tensor).data as Float32Array;
    },
    async rec(input, count, width) {
      const out = await rec.run({ [rec.inputNames[0] as string]: new ort.Tensor("float32", input, [count, 3, 48, width]) });
      const t = out[rec.outputNames[0] as string] as ort.Tensor;
      return { data: t.data as Float32Array, steps: t.dims[1] as number, classes: t.dims[2] as number };
    },
  };
  return { models, labels };
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const msg = event.data;
  if (msg?.type !== "run") return;
  const post = (reply: Reply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
  try {
    post({ type: "progress", id: msg.id, stage: "loading" });
    ready ??= load();
    const { models, labels } = await ready;
    post({ type: "progress", id: msg.id, stage: "recognizing" });
    const { width, height } = msg.bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 쓸 수 없습니다.");
    ctx.drawImage(msg.bitmap, 0, 0);
    msg.bitmap.close();
    const img = rgbaToBgr(ctx.getImageData(0, 0, width, height).data, width, height);
    const lines = await runOcr(img, models, labels);
    post({ type: "result", id: msg.id, lines: lines.map((l) => ({ text: l.text, score: l.score, box: l.box })), width, height });
  } catch (error) {
    ready = null;
    post({ type: "error", id: msg.id, message: error instanceof Error ? error.message : "인식에 실패했습니다." });
  }
};
