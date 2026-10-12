// 소스 계약: 광고 코드(next/script·AdSense 로더·광고 모듈)는 가이드 글 상세 페이지에서만 쓰이고, 마크다운 렌더러는 원시 HTML 을 넣지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readCode, root, walk } from "./source-contract-helpers.ts";

const sources = walk(path.join(root, "src"))
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => path.relative(root, f).split(path.sep).join("/"))
  .sort();

const importers = (pattern: RegExp) => sources.filter((f) => pattern.test(readCode(f)));

const DETAIL = "src/app/(marketing)/guide/[slug]/page.tsx";

test("next/script 는 광고 로더(ad-script.tsx) 하나만 임포트한다", () => {
  assert.deepEqual(importers(/from\s+["']next\/script["']/), ["src/components/ads/ad-script.tsx"]);
});

test("광고 컴포넌트는 가이드 글 상세 페이지만 임포트한다", () => {
  assert.deepEqual(importers(/from\s+["']@\/components\/ads\//), [DETAIL]);
  const configUsers = importers(/from\s+["'](@\/lib\/ads\/config|\.\.?\/.*ads\/config)(\.ts)?["']/);
  for (const f of configUsers) assert.ok(f === DETAIL || f.startsWith("src/components/ads/"), f);
});

test("레이아웃(전역·앱·공유·로그인·소개)은 광고·next/script 를 임포트하지 않는다", () => {
  const layouts = sources.filter((f) => f.endsWith("/layout.tsx"));
  assert.ok(layouts.length >= 2);
  for (const f of layouts) assert.doesNotMatch(readCode(f), /next\/script|components\/ads|lib\/ads|adsbygoogle|googlesyndication/, f);
});

test("AdSense 문자열은 src/components/ads 밖에 없다", () => {
  for (const f of sources) {
    if (f.startsWith("src/components/ads/")) continue;
    assert.doesNotMatch(readFileSync(path.join(root, f), "utf8"), /adsbygoogle|googlesyndication/, f);
  }
  assert.doesNotMatch(readFileSync(path.join(root, "next.config.ts"), "utf8"), /adsbygoogle|googlesyndication/);
});

test("광고 컴포넌트는 스위치를 거쳐야만 렌더한다", () => {
  for (const f of ["src/components/ads/ad-slot.tsx", "src/components/ads/ad-script.tsx"]) {
    assert.match(readCode(f), /if\s*\(!adsEnabledFor\(pathname, env\)/, f);
  }
});

test("마크다운 렌더러는 dangerouslySetInnerHTML 을 쓰지 않고, 외부 링크에 rel 을 붙이고 새 탭을 열지 않는다", () => {
  const code = readCode("src/components/guide/markdown.tsx");
  assert.doesNotMatch(code, /dangerouslySetInnerHTML/);
  assert.match(code, /rel="noopener noreferrer nofollow"/);
  assert.doesNotMatch(code, /target=/);
});

test("가이드 글 상세는 정적 생성(dynamicParams=false)이고 JSON-LD 의 < 를 이스케이프한다", () => {
  const code = readCode(DETAIL);
  assert.match(code, /export const dynamicParams = false/);
  assert.match(code, /export function generateStaticParams/);
  assert.match(code, /\.replace\(\/<\/g, "\\\\u003c"\)/);
});
