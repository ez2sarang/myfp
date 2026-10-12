"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; labels: number } | { kind: "error"; message: string };
type Reply = { type: "ready"; id: number; labels: number } | { type: "error"; id: number; message: string };

// 업로드 화면 뼈대: 사진을 고르면 그때 워커를 만들어 모델을 받고 무결성을 확인한다(첫 화면 진입만으로는 받지 않는다).
// 고른 File 은 상태에 담지 않고, fetch·FormData 로 보내지 않는다.
export function PhotoImport() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => () => workerRef.current?.terminate(), []);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = (event.currentTarget.files?.length ?? 0) > 0;
    event.currentTarget.value = "";
    if (!picked) return;
    if (!workerRef.current) {
      const worker = new Worker(new URL("../../lib/ocr/ocr.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<Reply>) =>
        setStatus(e.data.type === "ready" ? { kind: "ready", labels: e.data.labels } : { kind: "error", message: e.data.message });
      worker.onerror = () => setStatus({ kind: "error", message: "인식 모듈을 시작하지 못했습니다." });
      workerRef.current = worker;
    }
    setStatus({ kind: "loading" });
    workerRef.current.postMessage({ type: "load", id: Date.now() });
  }

  return (
    <Card className="shadow-raised">
      <CardHeader>
        <CardTitle>사진 고르기</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          사진
          <input type="file" accept="image/*" onChange={onChange} disabled={status.kind === "loading"} className="text-sm" />
        </label>
        <p role="status" className="text-sm text-muted">
          {status.kind === "idle" && "사진을 고르면 인식 모델을 준비합니다."}
          {status.kind === "loading" && "인식 모델을 내려받고 확인하는 중…"}
          {status.kind === "ready" && `인식 모델 준비 완료 (글자 ${status.labels.toLocaleString("ko-KR")}자)`}
          {status.kind === "error" && `오류: ${status.message}`}
        </p>
      </CardBody>
    </Card>
  );
}
