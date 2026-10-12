"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { prepareBitmap } from "@/lib/ocr/prepare-image";

type Line = { text: string; score: number };
type Status =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "loading" }
  | { kind: "recognizing" }
  | { kind: "done"; lines: Line[] }
  | { kind: "error"; message: string };
type Reply =
  | { type: "progress"; id: number; stage: "loading" | "recognizing" }
  | { type: "result"; id: number; lines: Line[] }
  | { type: "error"; id: number; message: string };

// 업로드 화면: 사진을 고르면 그때 워커를 만든다(첫 화면 진입만으로는 모델을 받지 않는다).
// 고른 File 은 상태에 담지 않고 fetch·FormData 로 보내지 않는다. 방향 보정·축소한 픽셀(ImageBitmap)만 워커로 넘긴다.
export function PhotoImport() {
  const workerRef = useRef<Worker | null>(null);
  const runRef = useRef(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => () => workerRef.current?.terminate(), []);

  function worker(): Worker {
    if (workerRef.current) return workerRef.current;
    const created = new Worker(new URL("../../lib/ocr/ocr.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (e: MessageEvent<Reply>) => {
      const reply = e.data;
      if (reply.id !== runRef.current) return; // 이전 사진의 늦은 응답은 버린다
      if (reply.type === "progress") setStatus({ kind: reply.stage });
      else if (reply.type === "result") setStatus({ kind: "done", lines: reply.lines.map(({ text, score }) => ({ text, score })) });
      else setStatus({ kind: "error", message: reply.message });
    };
    created.onerror = () => setStatus({ kind: "error", message: "인식 모듈을 시작하지 못했습니다." });
    workerRef.current = created;
    return created;
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const id = (runRef.current += 1);
    setStatus({ kind: "preparing" });
    try {
      const bitmap = await prepareBitmap(file);
      if (id !== runRef.current) return bitmap.close();
      worker().postMessage({ type: "run", id, bitmap }, [bitmap]);
    } catch {
      if (id === runRef.current) setStatus({ kind: "error", message: "사진을 읽지 못했습니다. 다른 사진을 골라 주세요." });
    }
  }

  const busy = status.kind === "preparing" || status.kind === "loading" || status.kind === "recognizing";

  return (
    <Card className="shadow-raised">
      <CardHeader>
        <CardTitle>사진 고르기</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          사진
          <input type="file" accept="image/*" onChange={onChange} disabled={busy} className="text-sm" />
        </label>
        <p role="status" className="text-sm text-muted">
          {status.kind === "idle" && "사진을 고르면 이 기기 안에서 글자를 읽습니다."}
          {status.kind === "preparing" && "사진을 준비하는 중…"}
          {status.kind === "loading" && "인식 모델을 내려받고 확인하는 중… (처음 한 번)"}
          {status.kind === "recognizing" && "글자를 읽는 중…"}
          {status.kind === "done" && `${status.lines.length}줄을 읽었습니다.`}
          {status.kind === "error" && `오류: ${status.message}`}
        </p>
        {status.kind === "done" && status.lines.length > 0 ? (
          <ol className="flex flex-col divide-y divide-line rounded-md border border-line text-sm">
            {status.lines.map((line, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 px-3 py-2">
                <span className="min-w-0 break-words">{line.text}</span>
                <span className="shrink-0 tabular-nums text-muted">{Math.round(line.score * 100)}%</span>
              </li>
            ))}
          </ol>
        ) : null}
      </CardBody>
    </Card>
  );
}
