// OCR 자산 무결성 (순수 모듈): 같은 출처에서 받은 모델·사전·wasm 의 크기와 SHA-256 을 커밋된 매니페스트(ocr-models.json)와 비교한다.
// 맞을 때만 다음 단계(InferenceSession 생성·wasm 사용)로 넘긴다. 다르면 IntegrityError 를 던지고 아무것도 만들지 않는다.

export interface AssetSpec {
  file: string;
  bytes: number;
  sha256: string;
}

export class IntegrityError extends Error {}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", view as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 같은 출처 경로만 허용(/ 로 시작, // 와 :// 금지) — 다른 사이트에서 모델을 받지 않는다 */
export function isSameOriginPath(file: string): boolean {
  return file.startsWith("/") && !file.startsWith("//") && !file.includes("://") && !file.includes("..");
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/** 받은 뒤 크기·SHA-256 을 확인한 바이트 */
export async function fetchVerified(spec: AssetSpec, fetcher: Fetcher): Promise<Uint8Array> {
  if (!isSameOriginPath(spec.file)) throw new IntegrityError(`허용하지 않는 경로: ${spec.file}`);
  const res = await fetcher(spec.file);
  if (!res.ok) throw new IntegrityError(`받기 실패(${res.status}): ${spec.file}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length !== spec.bytes) throw new IntegrityError(`크기 불일치: ${spec.file}`);
  const hash = await sha256Hex(bytes);
  if (hash !== spec.sha256) throw new IntegrityError(`SHA-256 불일치: ${spec.file}`);
  return bytes;
}

/** 확인을 통과한 바이트로만 세션을 만든다 (createSession 은 확인 뒤에만 불린다) */
export async function createVerifiedSession<S>(spec: AssetSpec, fetcher: Fetcher, createSession: (bytes: Uint8Array) => Promise<S>): Promise<S> {
  const bytes = await fetchVerified(spec, fetcher);
  return createSession(bytes);
}
