import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { PhotoImport } from "@/components/import/photo-import";
import { db } from "@/lib/db/pool";
import { getMembership } from "@/lib/db/queries/household";
import { seoulToday } from "@/lib/finance/dates";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "사진으로 등록" };

// 사진 → 항목 인식 → 확인·수정 → 등록. 인식은 브라우저(워커) 안에서만 하고 사진은 서버로 보내지 않는다.
// 이 경로의 CSP 는 전체보다 좁고, wasm 은 워커 진입 파일에만 열려 있다(next.config.ts). 광고·분석 스크립트를 두지 않는다.
export default async function PhotoImportPage() {
  const viewer = await requireActiveUser("/app/import/photo");
  const membership = await getMembership(db, viewer.id);
  return (
    <>
      <PageHeader
        title="사진으로 등록"
        description="카드 명세서·영수증·고지서·손글씨 메모 사진에서 항목을 읽어 확인한 뒤 한 번에 등록합니다. 인식은 이 기기 안에서만 하며 사진은 서버로 보내지 않고, 이 화면을 떠나면 사진과 인식 결과는 사라집니다."
      />
      <PhotoImport today={seoulToday()} sharedWithGroup={membership !== null && (membership.shareFixed || membership.shareBalances)} />
    </>
  );
}
