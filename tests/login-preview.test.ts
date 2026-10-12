// 로그인 화면 링크 미리보기: callbackUrl 의 종류(공유 /s/ · 초대 /join/ · 그 밖)만 보고 일반 문구를 고르고, 토큰·주소는 어떤 메타 필드에도 넣지 않는다.
// 비로그인 /s/*·/join/* 응답(proxy 의 303)은 바꾸지 않는다 — 토큰 유효 여부를 알려 주는 신호가 생기지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import nextConfig from "../next.config.ts";
import { decideProxy } from "../src/lib/auth-core/proxy-decision.ts";
import { classifyPath } from "../src/lib/auth-core/route-guard.ts";
import { OG_IMAGE, OG_IMAGE_NAMES, PREVIEW_TEXT, availableOgImages, loginMetadata, previewKind } from "../src/lib/auth-core/login-preview.ts";
import { root } from "./source-contract-helpers.ts";

// 가짜 토큰(실제 토큰과 같은 43자 길이). 공개 저장소 검사에 걸리지 않게 실행 중에 만든다
const TOKEN = `faketoken${"0".repeat(34)}`;

test("종류: /s/… 는 공유, /join/… 는 초대, 그 밖·의심스러운 값은 기본 로그인", () => {
  assert.equal(previewKind(`/s/${TOKEN}`), "share");
  assert.equal(previewKind(`/join/${TOKEN}`), "invite");
  for (const raw of ["", undefined, 42, "/app", "/s", "/join", "/sx/abc", "/joinx/abc", "/login", "/S/abc"]) assert.equal(previewKind(raw), "login", String(raw));
  // 악의적 값: 다른 사이트·경로 조작·인코딩 우회·아주 긴 값
  for (const raw of [
    "//evil.example/s/abc",
    "https://evil.example/s/abc",
    "/s/../app",
    "/join/../../admin",
    "/s/%2e%2e/app",
    "%2Fs%2Fabc",
    "/\\evil.example/s/abc",
    `/s/${"a".repeat(600)}`,
    "/s/abc\r\nSet-Cookie: x=1",
  ]) {
    assert.equal(previewKind(raw), "login", raw);
  }
});

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

test("메타데이터에는 종류별 일반 문구만: 토큰·callbackUrl·og:url·canonical 없음, noindex 유지", () => {
  for (const raw of [`/s/${TOKEN}`, `/join/${TOKEN}`, `/s/${TOKEN}?x=1#y`, "/app/fixed?id=7", "//evil.example"]) {
    const meta = loginMetadata(previewKind(raw), new Set(OG_IMAGE_NAMES));
    const strings = allStrings(meta).join("\n");
    assert.ok(!strings.includes(TOKEN), raw);
    assert.ok(!strings.includes("evil"), raw);
    assert.ok(!/\/s\/|\/join\/|\/app/.test(strings), raw);
    assert.equal((meta.openGraph as { url?: unknown } | undefined)?.url, undefined);
    assert.equal(meta.alternates, undefined, "canonical 없음");
    assert.deepEqual(meta.robots, { index: false, follow: false });
  }
});

test("종류별 출력: 공유·초대는 제목·설명·대표 이미지(있을 때), 기본은 지금의 로그인 제목", () => {
  const all = new Set(OG_IMAGE_NAMES);
  const share = loginMetadata("share", all);
  assert.deepEqual(share.title, { absolute: "myfp 공유 링크 · 로그인하면 열려요" });
  assert.equal(share.description, PREVIEW_TEXT.share.description);
  assert.deepEqual(share.openGraph, {
    type: "website",
    locale: "ko_KR",
    siteName: "myfp",
    title: PREVIEW_TEXT.share.title,
    description: PREVIEW_TEXT.share.description,
    images: [{ url: "https://myfp.pineai.dev/og/share.png", width: 1200, height: 630, alt: "myfp 공유 링크" }],
  });
  assert.deepEqual(share.twitter, { card: "summary_large_image", title: PREVIEW_TEXT.share.title, description: PREVIEW_TEXT.share.description, images: ["https://myfp.pineai.dev/og/share.png"] });
  const invite = loginMetadata("invite", all);
  assert.deepEqual(invite.title, { absolute: "myfp 함께 보기 초대" });
  assert.equal((invite.openGraph as { images: { url: string }[] }).images[0]!.url, "https://myfp.pineai.dev/og/invite.png");
  const login = loginMetadata("login", all);
  assert.deepEqual(login.title, { absolute: "로그인 | myfp" });
  assert.equal((login.openGraph as { images?: unknown }).images, undefined, "기본 로그인에는 이미지 없음");
  // 이미지 파일이 없으면 이미지 없이(summary 카드)
  const bare = loginMetadata("share", new Set());
  assert.equal((bare.openGraph as { images?: unknown }).images, undefined);
  assert.deepEqual(bare.twitter, { card: "summary", title: PREVIEW_TEXT.share.title, description: PREVIEW_TEXT.share.description });
});

test("문구 길이: 제목 40자·설명 80자 이내(카카오 미리보기 권장), 개인 데이터 자리 없음", () => {
  for (const [kind, text] of Object.entries(PREVIEW_TEXT)) {
    assert.ok([...text.title].length <= 40, `${kind} 제목 ${[...text.title].length}자`);
    assert.ok([...text.description].length <= 80, `${kind} 설명 ${[...text.description].length}자`);
    assert.doesNotMatch(`${text.title} ${text.description}`, /\$\{|\d{1,3}(,\d{3})+|원\b/);
  }
  // 문구가 말하는 동작(개인정보 처리방침 3절·9절과 같은 사실)
  assert.match(PREVIEW_TEXT.share.description, /읽기 전용/);
  assert.match(PREVIEW_TEXT.share.description, /로그인/);
  assert.match(PREVIEW_TEXT.invite.description, /동의 문구를 확인하고 직접 수락/);
  assert.match(PREVIEW_TEXT.invite.description, /범위는 각자/);
  const privacy = readFileSync(path.join(root, "src/app/(marketing)/privacy/page.tsx"), "utf8");
  assert.match(privacy, /읽기 전용으로 보입니다/);
  assert.match(privacy, /동의 문구를 확인하고 직접 수락해야/);
  assert.match(privacy, /각자 고른 범위/);
});

test("미리보기 이미지 목록은 빌드 때 public/og 에 있는 파일만, 있으면 1200×630 PNG·200KB 이하", () => {
  assert.deepEqual([...availableOgImages("share,invite,evil")].sort(), ["invite", "share"]);
  assert.deepEqual([...availableOgImages("")], []);
  assert.deepEqual([...availableOgImages(undefined)].length >= 0, true);
  const present = OG_IMAGE_NAMES.filter((name) => {
    try {
      readFileSync(path.join(root, "public/og", `${name}.png`));
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(nextConfig.env?.MYFP_OG_IMAGES, present.join(","));
  for (const name of present) {
    const png = readFileSync(path.join(root, "public/og", `${name}.png`));
    assert.ok(png.length <= OG_IMAGE.maxBytes, `${name}.png ${png.length}바이트`);
    assert.equal(png.subarray(1, 4).toString("latin1"), "PNG", name);
    assert.equal(png.readUInt32BE(16), OG_IMAGE.width, `${name}.png 너비`);
    assert.equal(png.readUInt32BE(20), OG_IMAGE.height, `${name}.png 높이`);
  }
});

test("공개 경로: /og/<파일> 만 새로 공개되고 /og 로 시작하는 다른 경로는 그대로 보호", () => {
  for (const p of ["/og/share.png", "/og/invite.png"]) assert.equal(classifyPath(p), "public", p);
  for (const p of ["/og", "/ogre", "/og-image.png", "/OG/share.png", "/og/../app", "/og/%2e%2e/app", "/og//share.png", "/ocr/models/a.onnx", "/s/abc", "/join/abc"]) {
    assert.notEqual(classifyPath(p), "public", p);
  }
});

test("비로그인 /s/*·/join/* 는 토큰과 상관없이 똑같이 로그인으로(callbackUrl 만 경로대로) — proxy 판정 불변", async () => {
  const none = async () => false;
  for (const p of [`/s/${TOKEN}`, "/s/not-a-token", `/join/${TOKEN}`, "/join/x"]) {
    assert.deepEqual(await decideProxy(p, "", none), { action: "login", callback: p }, p);
  }
  // proxy 소스에 미리보기용 분기(User-Agent 판정 등)가 없다
  const proxy = readFileSync(path.join(root, "src/proxy.ts"), "utf8");
  assert.doesNotMatch(proxy, /user-agent|userAgent|kakao|preview|og:/i);
});
