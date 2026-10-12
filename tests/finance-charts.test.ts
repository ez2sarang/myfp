// 차트 데이터 가공: 비중 계산, 금액 → 비중 변환 시 절대 금액이 남지 않음, 빈 데이터.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetDonut,
  assetLiabilityCompare,
  categoryDonut,
  netWorthTrend,
  pct,
  projectionStack,
} from "../src/lib/finance/charts.ts";
import type { BalanceItem, FixedExpense } from "../src/lib/finance/types.ts";

test("분류 도넛: 0 은 빼고 큰 순, 비중 합은 100 근처, 색은 토큰 변수", () => {
  const d = categoryDonut([
    { category: "housing", monthly: 600_000 },
    { category: "telecom", monthly: 0 },
    { category: "insurance", monthly: 200_000 },
    { category: "subscription", monthly: 200_000 },
  ]);
  assert.equal(d.total, 1_000_000);
  assert.deepEqual(d.items.map((i) => [i.key, i.percent]), [["housing", 60], ["insurance", 20], ["subscription", 20]]);
  assert.ok(d.items.every((i) => /^var\(--chart-\d+\)$/.test(i.color)));
  assert.deepEqual(categoryDonut([]).items, []);
  assert.equal(pct(1, 3), 33.3);
  assert.equal(pct(5, 0), 0);
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

test("12개월 누적 막대: 쓰인 분류만 계열로, 대출 종료 후 합계가 줄어든다", () => {
  const stack = projectionStack([fx({ category: "housing", amount: 3_456_789 }), fx({ category: "loan", amount: 1_111_111, endDate: "2026-12-31" })], "2026-10-12", 12);
  assert.deepEqual(stack.series.map((s) => s.key), ["housing", "loan"]);
  assert.equal(stack.rows.length, 12);
  assert.equal(stack.rows[0]!.label, "26.10월");
  assert.equal(stack.rows[3]!.label, "27.1월");
  assert.equal(stack.rows[0]!.total, 3_456_789 + 1_111_111);
  assert.equal(stack.rows[3]!.total, 3_456_789, "12월 말 종료 → 1월부터 빠짐");
  assert.deepEqual(projectionStack([], "2026-10-12").series, []);
});

const bal = (o: Partial<BalanceItem>): BalanceItem => ({ id: "b", kind: "asset", category: "cash", name: "b", amount: 0, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null, ...o });

test("자산 구성은 자산만, 자산 vs 부채 비교", () => {
  const items = [bal({ category: "deposit", amount: 3_000_000 }), bal({ category: "investment", amount: 1_000_000 }), bal({ kind: "liability", category: "loan", amount: 2_000_000 })];
  const d = assetDonut(items);
  assert.deepEqual(d.items.map((i) => i.key), ["deposit", "investment"]);
  assert.equal(d.total, 4_000_000);
  const c = assetLiabilityCompare({ assetsTotal: 4_000_000, liabilitiesTotal: 2_000_000 });
  assert.deepEqual(c.items.map((i) => i.value), [4_000_000, 2_000_000]);
  assert.deepEqual(d.items.map((i) => i.percent), [75, 25]);
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
