// 가이드 글 프론트매터: 필수 키·slug 형식과 파일 이름 일치·날짜·읽는 시간·출처 검사가 빌드를 멈추게 한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GuideFormatError, parseGuideFile } from "../src/lib/guide/frontmatter.ts";

const FIELDS: Record<string, string> = {
  title: '"가상 글 제목"',
  description: '"가상 설명입니다."',
  slug: '"sample-guide"',
  date: "2026-10-01",
  updated: "2026-10-12",
  byline: '"편집팀"',
  tags: '["태그 하나", "태그 둘"]',
  reading_minutes: "7",
};
const SOURCES = 'sources:\n  - title: "가상 출처"\n    url: "https://example.com/source"';

function doc(overrides: Record<string, string | null> = {}, extra = SOURCES): string {
  const lines = Object.entries({ ...FIELDS, ...overrides })
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${[...lines, extra].filter(Boolean).join("\n")}\n---\n\n# 본문\n`;
}

test("올바른 프론트매터를 읽는다", () => {
  const { meta, body } = parseGuideFile(doc({ related: '["other-guide"]' }), "sample-guide");
  assert.equal(meta.title, "가상 글 제목");
  assert.equal(meta.slug, "sample-guide");
  assert.deepEqual(meta.tags, ["태그 하나", "태그 둘"]);
  assert.equal(meta.readingMinutes, 7);
  assert.deepEqual(meta.sources, [{ title: "가상 출처", url: "https://example.com/source" }]);
  assert.deepEqual(meta.related, ["other-guide"]);
  assert.match(body, /# 본문/);
});

test("필수 키가 하나라도 없으면 실패한다", () => {
  for (const key of Object.keys(FIELDS)) {
    assert.throws(() => parseGuideFile(doc({ [key]: null }), "sample-guide"), GuideFormatError, key);
  }
  assert.throws(() => parseGuideFile(doc({}, ""), "sample-guide"), GuideFormatError, "sources");
});

test("slug 형식이 틀리거나 파일 이름과 다르면 실패한다", () => {
  assert.throws(() => parseGuideFile(doc({ slug: '"Sample_Guide"' }), "Sample_Guide"), GuideFormatError);
  assert.throws(() => parseGuideFile(doc(), "other-name"), /파일 이름/);
});

test("날짜·읽는 시간·출처 주소·중복 키·related 형식을 검사한다", () => {
  assert.throws(() => parseGuideFile(doc({ date: "2026-1-01" }), "sample-guide"), GuideFormatError);
  assert.throws(() => parseGuideFile(doc({ updated: "2026-09-30" }), "sample-guide"), /updated/);
  assert.throws(() => parseGuideFile(doc({ reading_minutes: "0" }), "sample-guide"), GuideFormatError);
  assert.throws(() => parseGuideFile(doc({ reading_minutes: "7.5" }), "sample-guide"), GuideFormatError);
  assert.throws(() => parseGuideFile(doc({}, 'sources:\n  - title: "x"\n    url: "javascript:alert(1)"'), "sample-guide"), GuideFormatError);
  assert.throws(() => parseGuideFile(doc({}, `${SOURCES}\ntitle: "again"`), "sample-guide"), /두 번/);
  assert.throws(() => parseGuideFile(doc({ related: '["Bad Slug"]' }), "sample-guide"), GuideFormatError);
  assert.throws(() => parseGuideFile("# 프론트매터 없음\n", "sample-guide"), GuideFormatError);
});
