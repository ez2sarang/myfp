// 향후 12개월 월별 예상 지출: 종료일이 지나면 그 달부터 빠지고, 시작 전·비활성은 0, 연 주기는 납부 월에만.
import assert from "node:assert/strict";
import { test } from "node:test";
import { amountInMonth, monthlyProjection } from "../src/lib/finance/projection.ts";
import type { FixedExpense } from "../src/lib/finance/types.ts";

const item = (o: Partial<FixedExpense>): FixedExpense => ({
  id: "x",
  name: "x",
  category: "other",
  amount: 100_000,
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

test("종료일이 지난 달부터 빠진다: 종료일이 그 달 납부일보다 앞이면 그 달도 제외", () => {
  const loan = item({ category: "loan", billingDay: 20, endDate: "2027-03-20" });
  assert.equal(amountInMonth(loan, 2027, 3), 100_000, "종료일 = 납부일이면 포함");
  assert.equal(amountInMonth(loan, 2027, 4), 0);
  assert.equal(amountInMonth(item({ billingDay: 20, endDate: "2027-03-10" }), 2027, 3), 0, "종료일이 납부일 전");
  assert.equal(amountInMonth(item({ billingDay: 31, endDate: "2027-02-28" }), 2027, 2), 100_000, "말일 납부: 2월은 28일");
});

test("시작 전·비활성·보관은 0, 납부일 미정은 기간과 겹치는 달에 포함", () => {
  assert.equal(amountInMonth(item({ startDate: "2027-01-16" }), 2027, 1), 0, "시작일이 그 달 납부일 뒤");
  assert.equal(amountInMonth(item({ startDate: "2027-01-10" }), 2027, 1), 100_000);
  assert.equal(amountInMonth(item({ active: false }), 2026, 11), 0);
  assert.equal(amountInMonth(item({ archived: true }), 2026, 11), 0);
  assert.equal(amountInMonth(item({ billingDay: null, endDate: "2026-11-01" }), 2026, 11), 100_000);
  assert.equal(amountInMonth(item({ billingDay: null, endDate: "2026-11-01" }), 2026, 12), 0);
});

test("연 주기: 납부 월에만 전액, 납부 월 미정이면 매달 12분의 1", () => {
  const yearly = item({ cycle: "yearly", amount: 1_200_000, billingMonth: 3, billingDay: 10 });
  assert.equal(amountInMonth(yearly, 2027, 3), 1_200_000);
  assert.equal(amountInMonth(yearly, 2027, 4), 0);
  assert.equal(amountInMonth(item({ cycle: "yearly", amount: 1_000_000, billingMonth: null }), 2027, 5), 83_333);
});

test("12개월 버킷: 이번 달부터, 분류별 합계, 대출 종료 후 합계가 줄어든다", () => {
  const items = [
    item({ category: "housing", amount: 500_000, billingDay: 25 }),
    item({ category: "loan", amount: 300_000, billingDay: 20, endDate: "2027-01-20" }),
    item({ category: "insurance", cycle: "yearly", amount: 240_000, billingMonth: 3, billingDay: 1 }),
  ];
  const buckets = monthlyProjection(items, "2026-10-12", 12);
  assert.equal(buckets.length, 12);
  assert.deepEqual(buckets.map((b) => b.month).slice(0, 4), ["2026-10", "2026-11", "2026-12", "2027-01"]);
  assert.equal(buckets[11]!.month, "2027-09");
  assert.equal(buckets[3]!.total, 800_000, "1월까지는 대출 포함");
  assert.equal(buckets[4]!.total, 500_000, "2월부터 대출 빠짐");
  assert.equal(buckets[5]!.total, 740_000, "3월은 연 보험료");
  assert.deepEqual(buckets[0]!.byCategory, { housing: 500_000, loan: 300_000 });
  assert.ok(buckets.slice(6).every((b) => b.total === 500_000));
});
