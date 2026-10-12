// 차트 데이터 가공: 비중 계산, 금액 → 비중 변환 시 절대 금액이 남지 않음, 빈 데이터.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetDonut,
  assetLiabilityCompare,
  categoryDonut,
  compareAsPercent,
  donutAsPercent,
  netWorthTrend,
  pct,
  projectionStack,
  stackAsPercent,
} from "../src/lib/finance/charts.ts";
import type { BalanceItem, FixedExpense } from "../src/lib/finance/types.ts";

test("분류 도넛: 0 은 빼고 큰 순, 비중 합은 100 근처, 색은 토큰 변수", () => {
  const d = categoryDonut([
    { category: "housing", monthly: 600_000 },
    { category: "telecom", monthly: 0 },
    { category: "insurance", monthly: 200_000 },
    { category: "subscription", monthly: 200_000 },
  ]);
  assert.equal(d.mode, "krw");
  assert.equal(d.total, 1_000_000);
  assert.deepEqual(d.items.map((i) => [i.key, i.percent]), [["housing", 60], ["insurance", 20], ["subscription", 20]]);
  assert.ok(d.items.every((i) => /^var\(--chart-\d+\)$/.test(i.color)));
  assert.deepEqual(categoryDonut([]).items, []);
  assert.equal(pct(1, 3), 33.3);
  assert.equal(pct(5, 0), 0);
});

test("비중 변환: 금액 숫자와 합계가 결과에 남지 않는다", () => {
  const amounts = [6_543_210, 1_234_567];
  const d = categoryDonut([
    { category: "housing", monthly: amounts[0]! },
    { category: "loan", monthly: amounts[1]! },
  ]);
  const p = donutAsPercent(d);
  const json = JSON.stringify(p);
  assert.equal(p.mode, "percent");
  assert.equal(p.total, null);
  for (const n of [...amounts, amounts[0]! + amounts[1]!]) assert.equal(json.includes(String(n)), false, String(n));
  assert.deepEqual(p.items.map((i) => i.value), p.items.map((i) => i.percent));
});

const fx = (o: Partial<FixedExpense>): FixedExpense => ({
  id: "x",
  name: "x",
  category: "other",
  amount: 0,
  cycle: "monthly",
  billingDay: 10,
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

test("12개월 누적 막대: 쓰인 분류만 계열로, 비중 변환은 첫 달 = 100", () => {
  const stack = projectionStack([fx({ category: "housing", amount: 3_456_789 }), fx({ category: "loan", amount: 1_111_111, endDate: "2026-12-31" })], "2026-10-12", 12);
  assert.deepEqual(stack.series.map((s) => s.key), ["housing", "loan"]);
  assert.equal(stack.rows.length, 12);
  assert.equal(stack.rows[0]!.label, "26.10월");
  assert.equal(stack.rows[3]!.label, "27.1월");
  const p = stackAsPercent(stack);
  assert.equal(p.rows[0]!.total, 100);
  assert.equal(p.rows[3]!.total, pct(3_456_789, 3_456_789 + 1_111_111));
  const json = JSON.stringify(p);
  for (const n of [3_456_789, 1_111_111, 4_567_900]) assert.equal(json.includes(String(n)), false, String(n));
  assert.deepEqual(projectionStack([], "2026-10-12").series, []);
});

const bal = (o: Partial<BalanceItem>): BalanceItem => ({ id: "b", kind: "asset", category: "cash", name: "b", amount: 0, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null, ...o });

test("자산 구성은 자산만, 자산 vs 부채 비교와 비중 변환", () => {
  const items = [bal({ category: "deposit", amount: 3_000_000 }), bal({ category: "investment", amount: 1_000_000 }), bal({ kind: "liability", category: "loan", amount: 2_000_000 })];
  const d = assetDonut(items);
  assert.deepEqual(d.items.map((i) => i.key), ["deposit", "investment"]);
  assert.equal(d.total, 4_000_000);
  const c = assetLiabilityCompare({ assetsTotal: 4_000_000, liabilitiesTotal: 2_000_000 });
  assert.deepEqual(c.items.map((i) => i.value), [4_000_000, 2_000_000]);
  const cp = compareAsPercent(c);
  assert.deepEqual(cp.items.map((i) => i.value), [66.7, 33.3]);
  assert.equal(JSON.stringify(cp).includes("4000000"), false);
});

test("순자산 추이: 오래된 달부터, 순자산 = 자산 − 부채", () => {
  assert.deepEqual(
    netWorthTrend([
      { month: "2026-11", assetsTotal: 10, liabilitiesTotal: 4 },
      { month: "2026-10", assetsTotal: 8, liabilitiesTotal: 5 },
    ]),
    [
      { month: "2026-10", assets: 8, liabilities: 5, netWorth: 3 },
      { month: "2026-11", assets: 10, liabilities: 4, netWorth: 6 },
    ],
  );
});
