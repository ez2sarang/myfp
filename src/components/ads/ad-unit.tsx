"use client";

import { useEffect } from "react";

// 광고 단위 하나: 마운트 때 adsbygoogle 큐에 한 번 넣는다. 스크립트 로드는 ad-script.tsx(글 상세 페이지 전용)가 맡는다.
export function AdUnit({ client, slot }: { client: string; slot: string }) {
  useEffect(() => {
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle ?? []).push({});
    } catch {
      // 광고 실패는 본문에 영향을 주지 않는다
    }
  }, []);
  return <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />;
}
