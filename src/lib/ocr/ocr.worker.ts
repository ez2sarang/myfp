/// <reference lib="webworker" />
// OCR 워커: 업로드 화면에서만 지연 로딩한다. 모델·사전·wasm 은 같은 출처(/ocr/*)에서 받아 SHA-256 을 확인한 뒤에만 쓴다(CDN 없음).
// 이 워커는 네트워크로 아무것도 보내지 않는다(받기만).
import * as ort from "onnxruntime-web/wasm";
import { createVerifiedSession, fetchVerified, type Fetcher } from "./integrity";
import manifest from "./ocr-models.json";

type Request = { type: "load"; id: number };
type Reply = { type: "ready"; id: number; labels: number } | { type: "error"; id: number; message: string };

const fetcher: Fetcher = (url) => fetch(url, { credentials: "same-origin", cache: "force-cache" });

let ready: Promise<{ det: ort.InferenceSession; rec: ort.InferenceSession; labels: string[] }> | null = null;

async function load() {
  const wasm = await fetchVerified(manifest.ort.wasm, fetcher);
  ort.env.wasm.wasmBinary = wasm;
  ort.env.wasm.wasmPaths = "/ocr/ort/";
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const options: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
  const [det, rec, dict] = await Promise.all([
    createVerifiedSession(manifest.models.det, fetcher, (bytes) => ort.InferenceSession.create(bytes, options)),
    createVerifiedSession(manifest.models.rec, fetcher, (bytes) => ort.InferenceSession.create(bytes, options)),
    fetchVerified(manifest.models.dict, fetcher),
  ]);
  const labels = new TextDecoder().decode(dict).split("\n");
  return { det, rec, labels };
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const msg = event.data;
  if (msg?.type !== "load") return;
  const post = (reply: Reply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
  try {
    ready ??= load();
    const { labels } = await ready;
    post({ type: "ready", id: msg.id, labels: labels.length });
  } catch (error) {
    ready = null;
    post({ type: "error", id: msg.id, message: error instanceof Error ? error.message : "모델을 불러오지 못했습니다." });
  }
};
