// 사진 전처리(메인 스레드): 원본 File 은 보관·전송하지 않는다. EXIF 방향만 반영해 긴 변 1280 이하로 캔버스에 다시 그린 픽셀만 워커로 넘긴다.
// 캔버스 픽셀에는 EXIF(GPS 포함)가 없다. 나중에 썸네일·첨부를 저장하게 되면 encodeJpeg 의 재인코딩본만 쓴다(APP1 Exif·XMP 가 없음을 확인한다).
import { fitWithin, MAX_SIDE } from "./pipeline.ts";

/** 방향 보정 + 축소한 ImageBitmap (워커로 transfer 한다) */
export async function prepareBitmap(file: Blob, maxSide = MAX_SIDE): Promise<ImageBitmap> {
  const source = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(source.width, source.height, maxSide);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 쓸 수 없습니다.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, width, height);
    return canvas.transferToImageBitmap();
  } finally {
    source.close();
  }
}

/** JPEG 머리 조각(SOS 이전)에 APP1(0xFFE1) 조각이 있는지 — Exif(GPS 포함)와 XMP 가 모두 APP1 에 담긴다.
 *  JPEG 가 아니면 false, 머리 조각 구조를 끝까지 읽지 못하면 확인 불가로 보고 true(있음 취급). */
export function hasApp1Metadata(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return true;
    const marker = bytes[i + 1] as number;
    if (marker === 0xe1) return true;
    if (marker === 0xd9 || marker === 0xda) return false; // EOI·SOS: 머리 조각 끝
    const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    if (length < 2) return true;
    i += 2 + length;
  }
  return true;
}

/** 캔버스를 JPEG 로 다시 인코딩한다. 결과에 APP1(Exif·XMP) 조각이 있으면 쓰지 않고 실패한다 */
export async function encodeJpeg(canvas: Pick<OffscreenCanvas, "convertToBlob">, quality = 0.85): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  if (blob.type !== "image/jpeg") throw new Error("JPEG 로 인코딩하지 못했습니다.");
  if (hasApp1Metadata(new Uint8Array(await blob.arrayBuffer()))) throw new Error("재인코딩한 사진에 메타데이터가 남아 있습니다.");
  return blob;
}
