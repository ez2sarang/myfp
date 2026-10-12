// 세부 항목 목록: 쿼리 검증, 날짜순(말일·미정·다음 달), 금액순 동률, 분류 필터, 비활성·종료 제외, 금액 숨김 시 금액순 금지.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSET_SORTS, FIXED_SORTS, MASKED_FIXED_SORTS, assetDetails, fixedDetails, listHref, parseListQuery, type FixedSort } from "../src/lib/finance/detail-list.ts";
import { ASSET_CATEGORIES, EXPENSE_CATEGORIES, type BalanceItem, type FixedExpense } from "../src/lib/finance/types.ts";

const TODAY = "2026-10-12";
let n = 0;
const fx = (o: Partial<FixedExpense>): FixedExpense => ({
  id: `f${++n}`,
  name: "x",
  category: "other",
  amount: 10_000,
  cycle: "monthly",
  billingDay: 15,
  billingMonth: null,
  paymentMethod: null,
  institution: null,
  startDate: null,
  endDate: null,
  active: true,
  note: null,
  source: "manual",
  archived: false,
  ...o,
});
const q = (sort: FixedSort, dir: "asc" | "desc" = "asc", cat: string | null = null) => ({ sort, dir, cat });

test("쿼리: 허용 목록 밖의 값은 무시하고 기본값, 금액순 기본 방향은 내림차순, 접두사 지원", () => {
  const opts = { sorts: FIXED_SORTS, defaultSort: "date" as FixedSort, categories: EXPENSE_CATEGORIES };
  assert.deepEqual(parseListQuery({}, opts), { sort: "date", dir: "asc", cat: null });
  assert.deepEqual(parseListQuery({ sort: "amount", dir: "desc", cat: "telecom" }, opts), { sort: "amount", dir: "desc", cat: "telecom" });
  assert.deepEqual(parseListQuery({ sort: "amount" }, opts), { sort: "amount", dir: "desc", cat: null });
  assert.deepEqual(parseListQuery({ sort: "DROP TABLE", dir: "sideways", cat: "<script>" }, opts), { sort: "date", dir: "asc", cat: null });
  assert.deepEqual(parseListQuery({ sort: ["name", "amount"] }, opts), { sort: "name", dir: "asc", cat: null });
  assert.deepEqual(parseListQuery({ asort: "asOf", acat: "cash", sort: "amount" }, { sorts: ASSET_SORTS, defaultSort: "amount", categories: ASSET_CATEGORIES, prefix: "a" }), {
    sort: "asOf",
    dir: "asc",
    cat: "cash",
  });
  assert.equal(listHref("/app", "", { sort: "amount", dir: "desc", cat: "telecom" }, {}, "#detail-list"), "/app?sort=amount&dir=desc&cat=telecom#detail-list");
});

test("날짜순: 다음 납부일이 가까운 순, 말일 처리, 다음 달로 넘어간 항목은 뒤, 납부일 미정은 방향과 상관없이 맨 뒤", () => {
  const items = [
    fx({ name: "미정", billingDay: null }),
    fx({ name: "5일", billingDay: 5 }), // 이번 달은 지남 → 11-05
    fx({ name: "말일", billingDay: 31 }), // 10-31
    fx({ name: "20일", billingDay: 20 }),
    fx({ name: "오늘", billingDay: 12 }),
  ];
  const asc = fixedDetails(items, TODAY, q("date"));
  assert.deepEqual(asc.rows.map((r) => r.name), ["오늘", "20일", "말일", "5일", "미정"]);
  assert.deepEqual(asc.rows.map((r) => r.daysLeft), [0, 8, 19, 24, null]);
  assert.equal(asc.rows[2]!.nextDate, "2026-10-31");
  const desc = fixedDetails(items, TODAY, q("date", "desc"));
  assert.deepEqual(desc.rows.map((r) => r.name), ["5일", "말일", "20일", "오늘", "미정"]);
  const feb = fixedDetails([fx({ name: "말일", billingDay: 31 })], "2027-02-01", q("date"));
  assert.equal(feb.rows[0]!.nextDate, "2027-02-28");
});

test("금액순: 동률은 이름 순, 내림차순도 동률은 이름 오름차순", () => {
  const items = [fx({ name: "다", amount: 500 }), fx({ name: "가", amount: 500 }), fx({ name: "나", amount: 900 })];
  assert.deepEqual(fixedDetails(items, TODAY, q("amount", "desc")).rows.map((r) => r.name), ["나", "가", "다"]);
  assert.deepEqual(fixedDetails(items, TODAY, q("amount", "asc")).rows.map((r) => r.name), ["가", "다", "나"]);
  assert.deepEqual(fixedDetails(items, TODAY, q("name", "desc")).rows.map((r) => r.name), ["다", "나", "가"]);
});

test("효력 있는 항목만: 비활성·보관·종료·시작 전 제외. 분류 필터와 합계(월 환산)", () => {
  const items = [
    fx({ name: "통신", category: "telecom", amount: 50_000 }),
    fx({ name: "연 통신", category: "telecom", cycle: "yearly", amount: 120_000, billingMonth: 3 }),
    fx({ name: "주거", category: "housing", amount: 500_000 }),
    fx({ name: "꺼짐", active: false }),
    fx({ name: "보관", archived: true }),
    fx({ name: "끝남", endDate: "2026-10-01" }),
    fx({ name: "예정", startDate: "2026-12-01" }),
  ];
  const all = fixedDetails(items, TODAY, q("name"));
  assert.deepEqual(all.rows.map((r) => r.name).sort(), ["연 통신", "주거", "통신"].sort());
  assert.deepEqual(all.categories.map((c) => c.key), ["housing", "telecom"]);
  assert.equal(all.monthlyTotal, 560_000);
  const telecom = fixedDetails(items, TODAY, q("category", "asc", "telecom"));
  assert.equal(telecom.count, 2);
  assert.equal(telecom.monthlyTotal, 60_000);
  assert.equal(telecom.query.cat, "telecom");
  const absent = fixedDetails(items, TODAY, q("name", "asc", "tax"));
  assert.equal(absent.query.cat, null, "목록에 없는 분류는 무시");
  assert.equal(absent.count, 3);
});

test("금액 숨김: 금액순 요청은 이름순으로 바뀌고 행에 금액이 없다. 기관 가림은 필드 자체를 뺀다", () => {
  const items = [fx({ name: "나", amount: 1_234_567, institution: "INST-ZZ" }), fx({ name: "가", amount: 7_654_321, institution: "INST-YY" })];
  const masked = fixedDetails(items, TODAY, q("amount", "desc"), { hideAmounts: true, hideDetails: true });
  assert.equal(masked.query.sort, "name");
  assert.deepEqual(masked.rows.map((r) => r.name), ["나", "가"].sort((a, b) => a.localeCompare(b, "ko")).reverse(), "방향(desc)은 이름순에 적용");
  assert.equal(masked.monthlyTotal, null);
  const json = JSON.stringify(masked);
  for (const s of ["1234567", "7654321", "INST-ZZ", '"institution"']) assert.equal(json.includes(s), false, s);
  assert.ok(!(MASKED_FIXED_SORTS as readonly string[]).includes("amount"));
});

const bal = (o: Partial<BalanceItem>): BalanceItem => ({ id: "b", kind: "asset", category: "cash", name: "b", amount: 0, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null, ...o });

test("자산 세부: 부채 제외, 기준일순은 미정이 맨 뒤, 분류 필터·합계", () => {
  const items = [
    bal({ name: "예금", category: "deposit", amount: 300, asOf: "2026-09-01" }),
    bal({ name: "현금", category: "cash", amount: 100 }),
    bal({ name: "주식", category: "investment", amount: 200, asOf: "2026-10-01" }),
    bal({ name: "대출", kind: "liability", category: "loan", amount: 999 }),
  ];
  const byDate = assetDetails(items, { sort: "asOf", dir: "desc", cat: null });
  assert.deepEqual(byDate.rows.map((r) => r.name), ["주식", "예금", "현금"]);
  const byAmount = assetDetails(items, { sort: "amount", dir: "desc", cat: null });
  assert.deepEqual(byAmount.rows.map((r) => r.name), ["예금", "주식", "현금"]);
  assert.equal(byAmount.total, 600);
  const deposit = assetDetails(items, { sort: "name", dir: "asc", cat: "deposit" });
  assert.deepEqual(deposit.rows.map((r) => r.name), ["예금"]);
  const masked = assetDetails(items, { sort: "amount", dir: "desc", cat: null }, { hideAmounts: true, hideDetails: true });
  assert.equal(masked.query.sort, "name");
  assert.ok(masked.rows.every((r) => r.amount === null && !("note" in r)));
});
