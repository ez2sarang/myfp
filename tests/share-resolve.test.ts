// 공유 보기 해석: 무효·만료·폐기·형식 오류·소유자 비활성은 모두 같은 null(→ 같은 404). 형식 오류는 DB 를 조회하지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateShareToken } from "../src/lib/share/token.ts";
import { resolveShareView } from "../src/lib/share/resolve.ts";
import { fakeDb, type Call } from "./fake-db.ts";

const NOW = new Date("2026-10-12T03:00:00Z");
const OWNER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LINK_ID = "12345678-1234-4234-8234-123456789012";

function linkRow(over: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    label: "가족",
    scopes: ["summary", "fixed"],
    masks: { amounts: true, details: true },
    created_at: new Date("2026-10-01T00:00:00Z"),
    expires_at: null,
    revoked_at: null,
    view_count: 0,
    last_viewed_at: null,
    owner_id: OWNER,
    owner_status: "active",
    ...over,
  };
}

function db(link: Record<string, unknown> | null, opts: { failView?: boolean } = {}) {
  return fakeDb((call: Call) => {
    if (call.text.includes("FROM myfp.share_links s JOIN myfp.users")) return { rows: link ? [link] : [] };
    if (call.text.startsWith("UPDATE myfp.share_links SET view_count")) return opts.failView ? new Error("db down") : { rowCount: 1 };
    return { rows: [] };
  });
}

test("형식이 틀린 토큰은 DB 를 조회하지 않고 null", async () => {
  for (const bad of ["", "abc", "a".repeat(44), "../x", undefined]) {
    const f = db(linkRow());
    assert.equal(await resolveShareView(f.db, bad, NOW), null);
    assert.equal(f.calls.length, 0);
  }
});

test("없는·폐기·만료·소유자 비활성 링크는 모두 null 이고 열람 기록도 남기지 않는다", async () => {
  const { token } = generateShareToken();
  for (const link of [
    null,
    linkRow({ revoked_at: new Date("2026-10-05T00:00:00Z") }),
    linkRow({ expires_at: new Date("2026-10-12T02:59:59Z") }),
    linkRow({ owner_status: "blocked" }),
    linkRow({ owner_status: "pending" }),
  ]) {
    const f = db(link);
    assert.equal(await resolveShareView(f.db, token, NOW), null, JSON.stringify(link));
    assert.equal(f.calls.some((c) => c.text.includes("view_count = view_count + 1")), false);
  }
});

test("조회는 토큰 원문이 아니라 SHA-256 해시로 하고, 데이터는 링크 소유자 id 로만 읽는다", async () => {
  const { token, hash } = generateShareToken();
  const f = db(linkRow());
  const view = await resolveShareView(f.db, token, NOW);
  assert.ok(view);
  const lookup = f.calls.find((c) => c.text.includes("WHERE s.token_hash = $1"));
  assert.deepEqual(lookup?.params, [hash]);
  assert.equal(f.calls.some((c) => c.params.includes(token)), false, "토큰 원문은 어떤 쿼리에도 넘기지 않는다");
  const dataQueries = f.calls.filter((c) => c.text.includes("FROM myfp.fixed_expenses") || c.text.includes("FROM myfp.balance_items"));
  assert.equal(dataQueries.length, 1, "선택하지 않은 자산·부채는 읽지 않는다");
  for (const q of dataQueries) {
    assert.match(q.text, /WHERE user_id = \$1/);
    assert.equal(q.params[0], OWNER);
  }
  assert.ok(f.calls.some((c) => c.text.includes("view_count = view_count + 1") && c.params[0] === LINK_ID), "열람 기록");
});

test("열람 기록이 실패해도 보기는 성공한다", async () => {
  const { token } = generateShareToken();
  const f = db(linkRow(), { failView: true });
  assert.ok(await resolveShareView(f.db, token, NOW));
});
