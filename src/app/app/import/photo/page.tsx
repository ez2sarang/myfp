import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { PhotoImport } from "@/components/import/photo-import";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "사진으로 등록" };

// 사진 → 항목 인식. 인식은 브라우저(워커) 안에서만 하고 사진은 서버로 보내지 않는다.
// 이 경로에만 wasm 을 허용하는 전용 CSP 가 붙는다(next.config.ts). 광고·분석 스크립트를 두지 않는다.
export default async function PhotoImportPage() {
  await requireActiveUser("/app/import/photo");
  return (
    <>
      <PageHeader
        title="사진으로 등록"
        description="카드 명세서·영수증·고지서 사진에서 항목을 읽습니다. 인식은 이 기기 안에서만 하며 사진은 서버로 보내지 않습니다. 처음 한 번 인식 모델(약 17MB)을 내려받습니다."
      />
      <PhotoImport />
    </>
  );
}
