// 실제 게시 글 12편: 모두 형식 검사를 통과하고, 출처·면책·기준일을 갖추고, 사이트맵에 13개 주소(목록+12편)로 실린다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GUIDE_GROUPS, guideSitemapEntries, loadGuides } from "../src/lib/guide/content.ts";
import { inlineText } from "../src/lib/guide/markdown.ts";

const guides = loadGuides();

test("12편 모두 읽히고 주제 그룹 순서(4묶음)와 같다", () => {
  assert.equal(guides.length, 12);
  assert.equal(GUIDE_GROUPS.length, 4);
  assert.deepEqual(
    guides.map((g) => g.meta.slug),
    GUIDE_GROUPS.flatMap((g) => [...g.slugs]),
  );
  assert.deepEqual(
    GUIDE_GROUPS.map((g) => g.slugs.length),
    [2, 4, 4, 2],
  );
});

test("각 글에 「참고 출처」·「알아두세요」 제목과 '작성·확인 기준일' 문단이 있다", () => {
  for (const { meta, blocks } of guides) {
    const h2 = blocks.flatMap((b) => (b.type === "heading" && b.level === 2 ? [b.text] : []));
    assert.ok(h2.includes("참고 출처"), `${meta.slug}: 참고 출처`);
    assert.ok(h2.includes("알아두세요"), `${meta.slug}: 알아두세요`);
    assert.ok(
      blocks.some((b) => b.type === "paragraph" && inlineText(b.children).startsWith("작성·확인 기준일")),
      `${meta.slug}: 작성·확인 기준일`,
    );
    assert.ok(meta.sources.length > 0 && meta.related.length > 0, meta.slug);
    assert.ok(meta.related.every((r) => r !== meta.slug), `${meta.slug}: 자기 자신을 관련 글로 두지 않는다`);
  }
});

test("본문의 첫 블록은 제목(#)이고, 링크는 모두 http(s) 다", () => {
  for (const { meta, blocks } of guides) {
    assert.equal(blocks[0]?.type === "heading" && blocks[0].level, 1, meta.slug);
    const json = JSON.stringify(blocks);
    for (const m of json.matchAll(/"href":"([^"]+)"/g)) assert.match(m[1] as string, /^https?:\/\//, meta.slug);
  }
});

test("사이트맵 가이드 항목: 목록 1 + 글 12 = 13개, lastModified 는 updated", () => {
  const entries = guideSitemapEntries("https://example.test", guides);
  assert.equal(entries.length, 13);
  assert.equal(entries[0]?.url, "https://example.test/guide");
  assert.equal(new Set(entries.map((e) => e.url)).size, 13);
  for (const g of guides) {
    const e = entries.find((x) => x.url === `https://example.test/guide/${g.meta.slug}`);
    assert.equal(e?.lastModified, g.meta.updated);
  }
});
