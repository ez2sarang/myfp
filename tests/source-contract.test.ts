// 소스 계약: 프레임워크 의존이라 직접 실행할 수 없는 배선을 소스 텍스트로 확인한다.
//  - 보호 페이지(/app/*, /admin/*)는 모두 첫 return 전에 세션 가드를 부른다(레이아웃의 가드만 믿지 않는다).
//  - 보호 라우트 핸들러도 가드를 부른다.
//  - 공유 보기(/s/[token])에는 쓰기 경로(서버 액션·POST)가 없다.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { guardsBeforeFirstReturn, pageFiles, readCode, root, walk } from "./source-contract-helpers.ts";

test("/app 아래 페이지는 모두 첫 return 전에 requireActiveUser 를 부른다 (승인 대기 안내 화면만 requireUser)", () => {
  const pages = pageFiles("app");
  assert.ok(pages.length >= 7, `페이지 수가 이상함: ${pages.length}`);
  for (const page of pages) {
    const code = readCode(page);
    const needle = page.endsWith("app/app/pending/page.tsx") ? /await requireUser\(/ : /await requireActiveUser\(/;
    assert.ok(guardsBeforeFirstReturn(code, needle), `${page}: 가드 누락 또는 return 뒤`);
  }
});

test("/admin 아래 페이지는 모두 첫 return 전에 requireAdmin 을 부르고, 레이아웃도 requireAdmin 을 부른다", () => {
  const pages = pageFiles("admin");
  assert.ok(pages.length >= 1);
  for (const page of pages) assert.ok(guardsBeforeFirstReturn(readCode(page), /await requireAdmin\(/), page);
  assert.ok(guardsBeforeFirstReturn(readCode("src/app/admin/layout.tsx"), /await requireAdmin\(/));
  assert.ok(guardsBeforeFirstReturn(readCode("src/app/app/layout.tsx"), /await requireUser\(/));
});

test("보호 경로의 라우트 핸들러는 모두 세션 가드를 먼저 부른다", () => {
  const handlers = walk(path.join(root, "src", "app", "app"))
    .filter((f) => f.endsWith(`${path.sep}route.ts`))
    .map((f) => path.relative(root, f).split(path.sep).join("/"));
  assert.ok(handlers.length >= 1);
  for (const file of handlers) {
    const code = readCode(file);
    const body = code.slice(code.search(/export async function (GET|POST|PUT|PATCH|DELETE)/));
    assert.match(body, /^export async function \w+\([^)]*\)[^{]*\{\s*const viewer = await requireActiveUser\(/, file);
  }
});

test("공유 보기에는 쓰기 경로가 없다: 서버 액션·폼·POST 핸들러 없음, 형식 검사·404·no-store 배선", () => {
  const dir = path.join(root, "src", "app", "s", "[token]");
  const files = readdirSync(dir);
  assert.deepEqual(files.sort(), ["page.tsx"], "공유 보기 폴더에는 page.tsx 만 있어야 한다 (route.ts 금지)");
  const page = readCode("src/app/s/[token]/page.tsx");
  assert.doesNotMatch(page, /use server|<form|action=/);
  assert.match(page, /await connection\(\)/);
  assert.match(page, /if \(!view\) notFound\(\);/);
  const view = readCode("src/components/share/share-view.tsx");
  assert.doesNotMatch(view, /use server|use client|<form|action=/);
});

test("서버 액션이 아닌 곳에서 next/headers cookies() 로 세션을 직접 읽지 않는다 (세션 판정은 session.ts 한 곳)", () => {
  const files = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join("/");
    const code = readCode(rel);
    if (/\bauth\(\)/.test(code)) assert.ok(["src/lib/session.ts"].includes(rel), `${rel}: auth() 직접 호출`);
  }
  assert.ok(existsSync(path.join(root, "src", "proxy.ts")), "proxy.ts 가 있어야 한다");
});

test("차트 컴포넌트는 use client 이고 DB·세션·서버 모듈을 가져오지 않는다 (데이터 가공은 서버의 finance/charts.ts)", () => {
  const files = walk(path.join(root, "src", "components", "charts"))
    .filter((f) => f.endsWith("-chart.tsx"))
    .map((f) => path.relative(root, f).split(path.sep).join("/"));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const code = readCode(f);
    assert.match(code, /^"use client";/, f);
    assert.doesNotMatch(code, /@\/lib\/(db|session|auth|actions)/, f);
  }
  for (const page of ["src/app/app/page.tsx", "src/app/app/assets/page.tsx"]) {
    assert.match(readCode(page), /from "@\/lib\/finance\/charts"/, `${page}: 차트 데이터는 서버에서 가공`);
  }
});
