// 사진 메타데이터: 재인코딩 결과 JPEG 에 APP1(Exif·XMP) 조각이 없어야 쓴다. (합성 바이트만 사용)
import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeJpeg, hasApp1Metadata } from "../src/lib/ocr/prepare-image.ts";

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const segment = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];

const SOI = [0xff, 0xd8];
const APP0_JFIF = segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const APP1_EXIF = segment(0xe1, [...ascii("Exif"), 0, 0, ...ascii("MM"), 0, 0x2a, 0, 0, 0, 8]);
const APP1_XMP = segment(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/"), 0, ...ascii("<x/>")]);
const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
// 스캔 자료 안의 우연한 FF E1 은 조각이 아니다
const SOS_AND_SCAN = [...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0xff, 0x00, 0xff, 0xe1, 0x34];
const EOI = [0xff, 0xd9];

const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat());

test("Exif·XMP APP1 조각이 있으면 true, JFIF 만 있으면 false", () => {
  assert.equal(hasApp1Metadata(jpeg(SOI, APP0_JFIF, APP1_EXIF, DQT, SOS_AND_SCAN, EOI)), true);
  assert.equal(hasApp1Metadata(jpeg(SOI, APP1_XMP, DQT, SOS_AND_SCAN, EOI)), true);
  assert.equal(hasApp1Metadata(jpeg(SOI, APP0_JFIF, DQT, SOS_AND_SCAN, EOI)), false);
});

test("JPEG 가 아니면 false, 머리 조각이 깨졌으면 확인 불가로 true", () => {
  assert.equal(hasApp1Metadata(new Uint8Array(ascii("\u0089PNG"))), false);
  assert.equal(hasApp1Metadata(jpeg(SOI, APP0_JFIF, [0x00, 0x00, 0x00, 0x00])), true);
  assert.equal(hasApp1Metadata(jpeg(SOI, APP0_JFIF)), true, "SOS 없이 끝남");
  assert.equal(hasApp1Metadata(jpeg(SOI, [0xff, 0xdb, 0x00, 0x01])), true, "길이 1");
});

function fakeCanvas(bytes: Uint8Array, type = "image/jpeg") {
  return { convertToBlob: async () => new Blob([bytes as BlobPart], { type }) };
}

test("encodeJpeg: 재인코딩 결과에 APP1 이 없을 때만 Blob 을 돌려준다", async () => {
  const clean = jpeg(SOI, APP0_JFIF, DQT, SOS_AND_SCAN, EOI);
  const blob = await encodeJpeg(fakeCanvas(clean));
  assert.equal(blob.type, "image/jpeg");
  assert.equal(hasApp1Metadata(new Uint8Array(await blob.arrayBuffer())), false);
  await assert.rejects(encodeJpeg(fakeCanvas(jpeg(SOI, APP1_EXIF, DQT, SOS_AND_SCAN, EOI))));
  await assert.rejects(encodeJpeg(fakeCanvas(clean, "image/png")));
});
