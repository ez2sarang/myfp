// 사진 인식 등록: JSON 항목만 받는 검증(알 수 없는 필드·건수·크기 상한), 세션 사용자 범위, 원자성(중간 실패 시 저장 없음),
// 감사 기록에는 건수만, 기존 항목과 이름·금액이 같으면 경고. 가짜 Db 와 가상 값만 쓴다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  IMPORT_FIELDS,
  IMPORT_MAX_CHARS,
  IMPORT_MAX_ITEMS,
  ImportLimitError,
  parseImportPayload,
  possibleDuplicates,
  saveImport,
  type ImportItem,
} from "../src/lib/import/register.ts";
import { fakeDb, type Call } from "./fake-db.ts";
import { root } from "./source-contract-helpers.ts";

const TODAY = "2026-10-12";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const FIXED = { target: "fixed", name: "가상통신", amount: 55000, category: "telecom", billingDay: 25, paymentMethod: "card" };
const PLANNED = { target: "planned", name: "가상가전", amount: 120000, category: "other", dueDate: "2026-10-03", count: 4 };
const ASSET = { target: "asset", name: "가상은행 자유적금", amount: 1200000, category: "deposit", asOf: "2026-10-12" };
const CARD = { target: "liability", name: "가상카드", amount: 1234000, category: "card", asOf: null };

const payload = (items: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ items, ...extra });

function plan(items: unknown[], extra: Record<string, unknown> = {}): ImportItem[] {
  const parsed = parseImportPayload(payload(items, extra), TODAY);
  assert.ok(parsed.ok, JSON.stringify(parsed));
  return parsed.value.items;
}

test("JSON 항목을 대상별 기존 검증 함수로 정규화: 고정지출은 매월·활성·출처 user, 카드 대금은 부채 card·만기 없음", () => {
  const items = plan([FIXED, PLANNED, ASSET, CARD], { private: true });
  assert.deepEqual(
    items.map((i) => i.target),
    ["fixed", "planned", "asset", "liability"],
  );
  const fixed = items[0]!;
  assert.equal(fixed.target, "fixed");
  if (fixed.target === "fixed") {
    assert.equal(fixed.input.cycle, "monthly");
    assert.equal(fixed.input.active, true);
    assert.equal(fixed.input.source, "user");
    assert.equal(fixed.input.billingDay, 25);
    assert.equal(fixed.input.paymentMethod, "card");
    assert.equal(fixed.input.private, true);
  }
  const planned = items[1]!;
  if (planned.target === "planned") assert.deepEqual(planned.input, { name: "가상가전", category: "other", amount: 120000, dueDate: "2026-10-03", count: 4 });
  const card = items[3]!;
  if (card.target === "liability") {
    assert.equal(card.input.kind, "liability");
    assert.equal(card.input.category, "card");
    assert.equal(card.input.endDate, null);
    assert.equal(card.input.asOf, null);
    assert.equal(card.input.private, true);
  }
});

test("받는 필드에는 원문·상자·이미지·사용자 id 가 없고, 알 수 없는 필드는 항목째 거부한다", () => {
  for (const fields of Object.values(IMPORT_FIELDS)) {
    for (const banned of ["text", "box", "image", "photo", "raw", "lines", "userId", "user_id", "id", "source"]) assert.ok(!fields.includes(banned), banned);
  }
  for (const extra of [{ text: "원문" }, { box: [[0, 0]] }, { image: "data:image/jpeg;base64,AAAA" }, { userId: OTHER }, { user_id: OTHER }, { source: "card_analysis" }]) {
    const parsed = parseImportPayload(payload([FIXED, { ...ASSET, ...extra }]), TODAY);
    assert.equal(parsed.ok, false, JSON.stringify(extra));
    if (!parsed.ok) assert.deepEqual(parsed.rowErrors, [{ index: 1, message: "알 수 없는 필드가 있습니다." }]);
  }
  assert.equal(parseImportPayload(payload([FIXED], { userId: OTHER }), TODAY).ok, false, "최상위 알 수 없는 필드");
});

test("요청 형식·건수·크기 상한", () => {
  assert.equal(parseImportPayload({ items: [FIXED] }, TODAY).ok, false, "문자열(JSON)만 받는다");
  assert.equal(parseImportPayload(new Blob(["x"]), TODAY).ok, false);
  assert.equal(parseImportPayload("{", TODAY).ok, false);
  assert.equal(parseImportPayload(payload([]), TODAY).ok, false);
  assert.equal(parseImportPayload(JSON.stringify({ items: "x" }), TODAY).ok, false);
  assert.equal(parseImportPayload(payload([FIXED], { private: "yes" }), TODAY).ok, false);
  assert.equal(parseImportPayload(payload(Array.from({ length: IMPORT_MAX_ITEMS }, () => FIXED)), TODAY).ok, true);
  const over = parseImportPayload(payload(Array.from({ length: IMPORT_MAX_ITEMS + 1 }, () => FIXED)), TODAY);
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.message, /최대 100건/);
  assert.equal(parseImportPayload(" ".repeat(IMPORT_MAX_CHARS + 1), TODAY).ok, false);
});

test("한 항목이라도 틀리면 계획 전체를 거부하고 그 위치·사유만 돌려준다 (부분 저장 없음)", () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ ...FIXED, amount: "55,000" }, /이름·금액·분류/],
    [{ ...FIXED, amount: -1 }, /금액/],
    [{ ...FIXED, amount: 1.5 }, /이름·금액·분류/],
    [{ ...FIXED, category: "food" }, /분류/],
    [{ ...FIXED, billingDay: 32 }, /납부일/],
    [{ ...PLANNED, dueDate: "2040-01-01" }, /날짜/],
    [{ ...PLANNED, count: 37 }, /분할/],
    [{ ...ASSET, category: "card" }, /분류/],
    [{ ...CARD, asOf: "2026-02-30" }, /기준일/],
    [{ ...CARD, asOf: "2027-10-12" }, /오늘\(서울 기준\) 이후/],
    [{ ...ASSET, target: "income" }, /대상/],
    [{ ...FIXED, name: "" }, /이름/],
  ];
  for (const [bad, message] of cases) {
    const parsed = parseImportPayload(payload([FIXED, bad, ASSET]), TODAY);
    assert.equal(parsed.ok, false, JSON.stringify(bad));
    if (!parsed.ok) {
      assert.equal(parsed.rowErrors?.length, 1, JSON.stringify(bad));
      assert.equal(parsed.rowErrors?.[0]?.index, 1);
      assert.match(parsed.rowErrors?.[0]?.message ?? "", message, JSON.stringify(bad));
    }
  }
});

const isWrite = (c: Call) => /^(INSERT|UPDATE|DELETE)/.test(c.text);

/** withTransaction 처럼: 함수가 끝까지 성공해야 쓰기가 남고, 던지면 하나도 남지 않는다 */
async function inTransaction(respond: (call: Call) => { rows?: Record<string, unknown>[]; rowCount?: number } | Error, items: ImportItem[]) {
  const { db, calls } = fakeDb(respond);
  try {
    const counts = await saveImport(db, USER, items);
    return { ok: true as const, counts, calls, committed: calls.filter(isWrite) };
  } catch (error) {
    return { ok: false as const, error, calls, committed: [] as Call[] };
  }
}

const countRows = (n: number) => (call: Call) => {
  if (call.text.startsWith("SELECT count(*)")) return { rows: [{ n: String(n) }] };
  if (call.text.startsWith("INSERT INTO myfp.fixed_expenses") || call.text.startsWith("INSERT INTO myfp.balance_items")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
  if (call.text.includes("information_schema.columns")) return { rows: [] };
  return { rows: [], rowCount: 1 };
};

test("저장: 모든 쿼리는 세션 사용자 id 로만, 분할 예정지출은 회차마다 한 행, 감사 기록에는 대상별 건수만", async () => {
  const items = plan([FIXED, PLANNED, ASSET, CARD]);
  const result = await inTransaction(countRows(0), items);
  assert.ok(result.ok);
  assert.deepEqual(result.counts, { fixed: 1, planned: 4, asset: 1, liability: 1 });
  for (const call of result.calls.filter((c) => /myfp\.(fixed_expenses|planned_expenses|balance_items|users|balance_snapshots)/.test(c.text))) {
    assert.equal(call.params[0], USER, call.text);
    assert.ok(!call.params.includes(OTHER));
  }
  assert.equal(result.committed.filter((c) => c.text.startsWith("INSERT INTO myfp.planned_expenses")).length, 4);
  const audit = result.calls.find((c) => c.text.startsWith("INSERT INTO myfp.audit_log"));
  assert.ok(audit);
  assert.equal(audit.params[1], "import.photo");
  const after = String(audit.params[5]);
  assert.deepEqual(JSON.parse(after), { items: 4, fixed: 1, planned: 4, asset: 1, liability: 1 });
  for (const secret of ["가상통신", "가상가전", "가상카드", "55000", "1234000"]) assert.ok(!after.includes(secret), secret);
});

test("원자성: 세 번째 항목에서 상한에 걸리면 앞의 저장까지 모두 되돌린다(던짐 → 트랜잭션 ROLLBACK)", async () => {
  const items = plan([FIXED, PLANNED, ASSET, CARD]);
  // 자산·부채 개수만 상한으로 응답 → 세 번째(ASSET)에서 실패
  const respond = (call: Call) =>
    call.text.startsWith("SELECT count(*)::text AS n FROM myfp.balance_items") ? { rows: [{ n: "100" }] } : countRows(0)(call);
  const result = await inTransaction(respond, items);
  assert.equal(result.ok, false);
  assert.ok(result.error instanceof ImportLimitError);
  assert.equal((result.error as ImportLimitError).index, 2);
  assert.equal((result.error as ImportLimitError).target, "asset");
  assert.deepEqual(result.committed, []);
  assert.ok(!result.calls.some((c) => c.text.startsWith("INSERT INTO myfp.audit_log")), "실패하면 감사 기록도 없다");
});

test("서버 액션은 JSON 문자열 하나만 받고, 검증 → (중복 경고) → 한 트랜잭션 저장 순서이며 세션 id 만 쓴다", () => {
  const code = readFileSync(path.join(root, "src/lib/actions/import.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /export async function registerImportAction\(payload: string\)/);
  assert.doesNotMatch(code, /FormData|formData|File\b|Blob\b/);
  const order = ["await assertSameOrigin()", "await requireActiveUser(", "parseImportPayload(payload", "possibleDuplicates(db, viewer.id", "withTransaction((tx) => saveImport(tx, viewer.id, plan.items))"].map((n) => code.indexOf(n));
  assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]!)), JSON.stringify(order));
});

test("기존 항목과 이름·금액이 같으면 경고(위치만), 다르면 없음 — 읽기만 한다", async () => {
  const { db, calls } = fakeDb((call) => {
    if (call.text.includes("FROM myfp.fixed_expenses WHERE user_id")) return { rows: [{ id: "x", name: "가상통신 ", amount: "55000", cycle: "monthly", billing_day: null, billing_month: null, active: true, archived: false }] };
    if (call.text.includes("FROM myfp.balance_items WHERE user_id")) return { rows: [{ id: "y", kind: "liability", category: "card", name: "가상카드", amount: "999", as_of: null }] };
    return { rows: [] };
  });
  const items = plan([FIXED, PLANNED, ASSET, CARD, { ...FIXED, amount: 56000 }]);
  assert.deepEqual(await possibleDuplicates(db, USER, items), [0]);
  assert.ok(calls.every((c) => c.text.startsWith("SELECT")));
  assert.ok(calls.every((c) => c.params[0] === USER));
});
