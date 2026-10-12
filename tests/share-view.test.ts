// 공유 보기 직렬화 계약: 선택한 섹션만, 가린 값은 결과(JSON)에 아예 없다, 사용자 식별 정보·항목 id 없음.
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMasks, normalizeScopes, parseShareInput } from "../src/lib/share/options.ts";
import { buildShareView, type ShareSource } from "../src/lib/share/view.ts";
import type { BalanceItem, FixedExpense } from "../src/lib/finance/types.ts";

const NOW = new Date("2026-10-12T03:00:00Z");
// 직렬화 결과에서 찾기 쉬운 가짜 값
const SECRET_AMOUNT = 7_777_123;
const SECRET_NOTE = "NOTE-SECRET-ZX9";
const SECRET_INST = "INST-SECRET-QW7";
const ITEM_ID = "11111111-2222-4333-8444-555555555555";

const fixed: FixedExpense[] = [
  {
    id: ITEM_ID,
    name: "월세",
    category: "housing",
    amount: SECRET_AMOUNT,
    cycle: "monthly",
    billingDay: 25,
    billingMonth: null,
    paymentMethod: "bank_autopay",
    institution: SECRET_INST,
    startDate: null,
    endDate: null,
    active: true,
    note: SECRET_NOTE,
    source: "manual",
    archived: false,
  },
  {
    id: "99999999-2222-4333-8444-555555555555",
    name: "보관된 항목",
    category: "other",
    amount: 1,
    cycle: "monthly",
    billingDay: 1,
    billingMonth: null,
    paymentMethod: null,
    institution: null,
    startDate: null,
    endDate: null,
    active: true,
    note: null,
    source: "manual",
    archived: true,
  },
];
const balances: BalanceItem[] = [
  { id: ITEM_ID, kind: "asset", category: "deposit", name: "예금", amount: SECRET_AMOUNT + 1, asOf: "2026-10-01", note: SECRET_NOTE, monthlyPayment: null, interestRate: null, endDate: null },
  { id: ITEM_ID, kind: "liability", category: "loan", name: "대출", amount: SECRET_AMOUNT + 2, asOf: null, note: null, monthlyPayment: SECRET_AMOUNT + 3, interestRate: 4.2, endDate: "2031-03-15" },
];

function source(over: Partial<ShareSource>): ShareSource {
  return { scopes: ["summary", "fixed", "balances"], masks: { amounts: false, details: false }, createdAt: NOW, expiresAt: null, fixed, balances, ...over };
}

test("금액 숨김: 직렬화한 결과 어디에도 금액(합계 포함)이 없다", () => {
  const json = JSON.stringify(buildShareView(source({ masks: { amounts: true, details: false } }), NOW));
  for (const n of [SECRET_AMOUNT, SECRET_AMOUNT + 1, SECRET_AMOUNT + 2, SECRET_AMOUNT + 3, SECRET_AMOUNT * 12, 1 - (SECRET_AMOUNT + 2)]) {
    assert.equal(json.includes(String(n)), false, `금액 ${n} 이 결과에 있음`);
  }
  assert.match(json, /"amount":null/);
});

test("메모·기관명 숨김: 값뿐 아니라 필드 자체가 없다", () => {
  const view = buildShareView(source({ masks: { amounts: false, details: true } }), NOW);
  const json = JSON.stringify(view);
  assert.equal(json.includes(SECRET_NOTE), false);
  assert.equal(json.includes(SECRET_INST), false);
  assert.equal(json.includes('"note"'), false);
  assert.equal(json.includes('"institution"'), false);
  assert.ok(json.includes(String(SECRET_AMOUNT)), "금액은 숨기지 않았으므로 보인다");
});

test("가리지 않으면 메모·기관명이 보인다 (가림이 실제로 차이를 만드는지 확인)", () => {
  const json = JSON.stringify(buildShareView(source({}), NOW));
  assert.ok(json.includes(SECRET_NOTE) && json.includes(SECRET_INST));
});

test("항목 id·사용자 식별 정보가 결과에 없다", () => {
  const json = JSON.stringify(buildShareView(source({}), NOW));
  assert.equal(json.includes(ITEM_ID), false);
  for (const key of ['"id"', '"userId"', '"user_id"', '"email"', '"ownerId"']) assert.equal(json.includes(key), false, key);
});

test("선택한 섹션만 있다. 보관한 항목은 나오지 않는다", () => {
  const onlyFixed = buildShareView(source({ scopes: ["fixed"] }), NOW);
  assert.equal(onlyFixed.summary, undefined);
  assert.equal(onlyFixed.balances, undefined);
  assert.deepEqual(onlyFixed.fixed?.map((f) => f.name), ["월세"]);
  const onlySummary = buildShareView(source({ scopes: ["summary"] }), NOW);
  assert.equal(onlySummary.fixed, undefined);
  assert.equal(onlySummary.balances, undefined, "요약만 공유하면 자산·부채(순자산 포함)는 없다");
  assert.equal(JSON.stringify(onlySummary).includes("보관된 항목"), false);
});

test("금액을 숨기면 분류 순서도 금액이 아니라 이름 순", () => {
  const extra = [...fixed, { ...fixed[0]!, id: "x", name: "보험", category: "insurance" as const, amount: SECRET_AMOUNT * 2 }];
  const view = buildShareView(source({ fixed: extra, masks: { amounts: true, details: true } }), NOW);
  assert.deepEqual(view.summary?.byCategory.map((c) => c.label), ["보험", "주거"].sort((a, b) => a.localeCompare(b, "ko")));
});

test("DB 의 scopes·masks 는 다시 정규화: 모르는 값은 버리고, 가림은 기본 켬", () => {
  assert.deepEqual(normalizeScopes(["fixed", "admin", 1]), ["fixed"]);
  assert.deepEqual(normalizeScopes("fixed"), []);
  assert.deepEqual(normalizeMasks(null), { amounts: true, details: true });
  assert.deepEqual(normalizeMasks({ amounts: false }), { amounts: false, details: true });
});

test("공유 생성 입력: 섹션 최소 1개, 만료 선택 필수, 체크박스 값으로 가림 결정", () => {
  const ok = parseShareInput({ label: " 가족 ", scope_fixed: "on", mask_details: "on", expires: "30" }, NOW);
  assert.ok(ok.ok);
  assert.deepEqual(ok.value.scopes, ["fixed"]);
  assert.deepEqual(ok.value.masks, { amounts: false, details: true });
  assert.equal(ok.value.label, "가족");
  const none = parseShareInput({ expires: "30" }, NOW);
  assert.ok(!none.ok && "scopes" in none.errors);
  const badExpiry = parseShareInput({ scope_fixed: "on", expires: "365" }, NOW);
  assert.ok(!badExpiry.ok && "expires" in badExpiry.errors);
});

test("금액 숨김이면 차트·비중을 아예 보내지 않는다 (비중으로 금액 역산 방지). 이번 달 남은 납부액도 null", () => {
  const masked = buildShareView(source({ masks: { amounts: true, details: true } }), NOW);
  assert.equal(masked.summary?.charts, undefined);
  assert.equal(masked.balances?.charts, undefined);
  assert.equal(masked.summary?.remainingThisMonth, null);
  assert.equal(masked.summary?.monthlyTotal, null);
  const json = JSON.stringify(masked);
  for (const key of ['"charts"', '"percent"', "ratio", '"series"', '"projection"', '"composition"', '"compare"', "annual"]) {
    assert.equal(json.includes(key), false, key);
  }
  assert.doesNotMatch(json, /"(total|monthlyTotal|monthly|amount|assetsTotal|liabilitiesTotal|netWorth|remainingThisMonth|monthlyPayment)":-?\d/, "금액 필드는 모두 null");
  for (const n of [SECRET_AMOUNT, SECRET_AMOUNT + 1, SECRET_AMOUNT + 2]) assert.equal(json.includes(String(n)), false, String(n));
  // 세부 목록(금액 아닌 정보)은 남는다
  assert.deepEqual(masked.summary?.details.rows.map((r) => r.name), ["월세"]);
  const open = buildShareView(source({}), NOW);
  assert.equal(open.summary?.charts?.categories.total, SECRET_AMOUNT);
  assert.equal(open.balances?.charts?.composition.total, SECRET_AMOUNT + 1);
  assert.equal(typeof open.summary?.remainingThisMonth, "number");
});

test("금액 숨김: 자산·부채 목록 순서가 금액과 무관하다 (분류 → 이름 순)", () => {
  const items: BalanceItem[] = [
    { id: "a", kind: "asset", category: "deposit", name: "다 예금", amount: 9_000_000, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null },
    { id: "b", kind: "asset", category: "deposit", name: "가 예금", amount: 1_000, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null },
    { id: "c", kind: "asset", category: "cash", name: "지갑", amount: 5_000_000, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null },
    { id: "d", kind: "liability", category: "loan", name: "나 대출", amount: 8_000_000, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null },
    { id: "e", kind: "liability", category: "loan", name: "가 대출", amount: 2_000, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null },
  ];
  const masked = buildShareView(source({ balances: items, masks: { amounts: true, details: true } }), NOW);
  const expectedAssets = ["현금:지갑", "예금·적금:가 예금", "예금·적금:다 예금"].sort((x, y) => {
    const [cx, nx] = x.split(":");
    const [cy, ny] = y.split(":");
    return cx!.localeCompare(cy!, "ko") || nx!.localeCompare(ny!, "ko");
  });
  assert.deepEqual(masked.balances?.assets.map((r) => `${r.category}:${r.name}`), expectedAssets);
  assert.deepEqual(masked.balances?.liabilities.map((r) => r.name), ["가 대출", "나 대출"]);
  // 같은 데이터를 금액 순(저장소 순서)으로 넣어도, 순서를 뒤집어 넣어도 결과 순서가 같다
  const reversed = buildShareView(source({ balances: [...items].reverse(), masks: { amounts: true, details: true } }), NOW);
  assert.deepEqual(reversed.balances?.assets.map((r) => r.name), masked.balances?.assets.map((r) => r.name));
  assert.deepEqual(reversed.balances?.liabilities.map((r) => r.name), masked.balances?.liabilities.map((r) => r.name));
});

test("세부 목록: 금액 숨김이면 sort=amount 를 요청해도 이름순이고 행·직렬화에 금액이 없다. 금액순은 정렬 선택지에도 없다", () => {
  const items: FixedExpense[] = [
    { ...fixed[0]!, id: "1", name: "다 항목", amount: 9_191_919 },
    { ...fixed[0]!, id: "2", name: "가 항목", amount: 1_212_121 },
    { ...fixed[0]!, id: "3", name: "나 항목", amount: 5_454_545 },
  ];
  const masked = buildShareView(source({ fixed: items, masks: { amounts: true, details: true } }), NOW, { sort: "amount", dir: "asc" });
  assert.equal(masked.summary?.details.query.sort, "name");
  assert.deepEqual(masked.summary?.details.rows.map((r) => r.name), ["가 항목", "나 항목", "다 항목"]);
  assert.ok(!(masked.summary?.sorts as readonly string[]).includes("amount"));
  assert.ok(masked.summary?.details.rows.every((r) => r.amount === null));
  const json = JSON.stringify(masked);
  for (const v of ["9191919", "1212121", "5454545"]) assert.equal(json.includes(v), false, v);
  const assetsMasked = buildShareView(source({ masks: { amounts: true, details: true } }), NOW, { asort: "amount" });
  assert.equal(assetsMasked.balances?.details.query.sort, "name");
  assert.ok(!(assetsMasked.balances?.sorts as readonly string[]).includes("amount"));
  // 금액을 숨기지 않으면 금액순이 그대로 동작한다
  const open = buildShareView(source({ fixed: items }), NOW, { sort: "amount", dir: "desc" });
  assert.deepEqual(open.summary?.details.rows.map((r) => r.amount), [9_191_919, 5_454_545, 1_212_121]);
});

test("세부 목록 기본값: 금액이 보이는 링크는 쿼리 없이 금액 내림차순, 금액 숨김 링크는 이름순 그대로(금액순 선택지 없음)", () => {
  const items: FixedExpense[] = [
    { ...fixed[0]!, id: "1", name: "가 항목", amount: 1_000 },
    { ...fixed[0]!, id: "2", name: "나 항목", amount: 900_000 },
    { ...fixed[0]!, id: "3", name: "다 항목", amount: 50_000 },
  ];
  const open = buildShareView(source({ fixed: items }), NOW);
  assert.deepEqual(open.summary?.details.query, { sort: "amount", dir: "desc", cat: null });
  assert.deepEqual(open.summary?.details.rows.map((r) => r.name), ["나 항목", "다 항목", "가 항목"]);
  assert.equal(open.balances?.details.query.sort, "amount");
  assert.equal(open.balances?.details.query.dir, "desc");
  const masked = buildShareView(source({ fixed: items, masks: { amounts: true, details: true } }), NOW);
  assert.deepEqual(masked.summary?.details.query, { sort: "name", dir: "asc", cat: null });
  assert.deepEqual(masked.summary?.details.rows.map((r) => r.name), ["가 항목", "나 항목", "다 항목"]);
  assert.ok(!(masked.summary?.sorts as readonly string[]).includes("amount"));
});

test("새 공유 링크의 기본값은 금액 표시: 금액 숨기기 체크가 없으면 amounts=false", () => {
  const r = parseShareInput({ scope_summary: "on", expires: "30" }, NOW);
  assert.ok(r.ok);
  assert.equal(r.value.masks.amounts, false);
});
