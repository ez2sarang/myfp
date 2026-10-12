// 가이드 글 마크다운 파서: 지원 문법, 원시 HTML·위험 스킴 차단, 본문 속 URL 끝 문장부호 처리.
import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineText, parseInline, parseMarkdown, safeHref } from "../src/lib/guide/markdown.ts";

test("제목·문단·구분선·순서/비순서 목록을 블록으로 나눈다", () => {
  const blocks = parseMarkdown("# 제목\n\n첫 줄\n이어진 줄\n\n## 소제목\n\n1. 하나\n2. 둘\n\n- 가\n- 나\n\n---\n\n### 작은 제목");
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["heading", "paragraph", "heading", "list", "list", "hr", "heading"],
  );
  assert.deepEqual(blocks[0], { type: "heading", level: 1, children: [{ type: "text", text: "제목" }], text: "제목" });
  assert.deepEqual(blocks[1], { type: "paragraph", children: [{ type: "text", text: "첫 줄 이어진 줄" }] });
  assert.equal(blocks[3]?.type === "list" && blocks[3].ordered, true);
  assert.equal(blocks[4]?.type === "list" && blocks[4].ordered, false);
  assert.equal(blocks[6]?.type === "heading" && blocks[6].level, 3);
});

test("표: 머리 행·구분 행·본문 행, 셀 안의 굵게", () => {
  const [table] = parseMarkdown("| 항목 | 월 금액 |\n|---|---|\n| 월세 | 70만 원 |\n| **합계** | **130만 원** |");
  assert.ok(table && table.type === "table");
  assert.deepEqual(table.head.map(inlineText), ["항목", "월 금액"]);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[1]?.[0], [{ type: "strong", children: [{ type: "text", text: "합계" }] }]);
});

test("체크박스 목록(- [ ])은 일반 목록과 따로 묶는다", () => {
  const blocks = parseMarkdown("- [ ] 첫 점검\n- [x] 둘째 점검\n- 일반 항목");
  assert.equal(blocks[0]?.type, "checklist");
  assert.deepEqual(blocks[0]?.type === "checklist" && blocks[0].items.map(inlineText), ["첫 점검", "둘째 점검"]);
  assert.equal(blocks[1]?.type, "list");
});

test("원시 HTML 은 해석하지 않고 글자로 남는다", () => {
  const [p] = parseMarkdown('<script>alert(1)</script> <img src=x onerror="alert(1)">');
  assert.deepEqual(p, { type: "paragraph", children: [{ type: "text", text: '<script>alert(1)</script> <img src=x onerror="alert(1)">' }] });
});

test("javascript:·data:·상대 경로 링크는 링크로 만들지 않는다", () => {
  for (const href of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "/relative", "//evil.example"]) {
    const nodes = parseInline(`[누르기](${href})`);
    assert.ok(nodes.every((n) => n.type === "text"), href);
    assert.deepEqual(nodes[0], { type: "text", text: "누르기" }, href);
  }
  assert.equal(safeHref("https://example.com/a b"), null);
  assert.equal(safeHref("https://example.com/\u0000"), null);
  assert.equal(safeHref("vbscript:x"), null);
  assert.equal(safeHref("https://example.com/path"), "https://example.com/path");
});

test("http(s) 링크와 본문 속 URL: 끝 문장부호·괄호는 링크에서 뺀다", () => {
  assert.deepEqual(parseInline("[안내](https://example.com/a)"), [{ type: "link", href: "https://example.com/a", children: [{ type: "text", text: "안내" }] }]);
  assert.deepEqual(parseInline("출처 — https://example.com/x?id=1."), [
    { type: "text", text: "출처 — " },
    { type: "link", href: "https://example.com/x?id=1", children: [{ type: "text", text: "https://example.com/x?id=1" }] },
    { type: "text", text: "." },
  ]);
  const inParens = parseInline("(https://example.com/y)");
  assert.equal(inParens[1]?.type === "link" && inParens[1].href, "https://example.com/y");
  assert.deepEqual(inParens[2], { type: "text", text: ")" });
});

test("굵게·기울임", () => {
  assert.deepEqual(parseInline("**굵게** 와 *기울임*"), [
    { type: "strong", children: [{ type: "text", text: "굵게" }] },
    { type: "text", text: " 와 " },
    { type: "em", children: [{ type: "text", text: "기울임" }] },
  ]);
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ type: "text", text: "2 * 3 * 4" }]);
});
