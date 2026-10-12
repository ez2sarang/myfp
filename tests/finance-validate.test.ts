// 입력 검증·정규화 시험 (서버 액션과 시드 적재가 같은 규칙을 쓴다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmount, parseBalanceInput, parseFixedInput } from "../src/lib/finance/validate.ts";
import { summarizeBalances, summarizeFixed, debtTimeline } from "../src/lib/finance/summary.ts";
import type { BalanceItem, FixedExpense } from "../src/lib/finance/types.ts";

const TODAY = "2026-10-12";

test("금액: 쉼표·원·공백 허용, 음수·소수·문자·1조 초과는 거부", () => {
  assert.equal(parseAmount("1,234,000"), 1_234_000);
  assert.equal(parseAmount("50000원"), 50_000);
  assert.equal(parseAmount(" 0 "), 0);
  assert.equal(parseAmount("1000000000000"), 1_000_000_000_000);
  for (const bad of ["-1", "1.5", "abc", "", "1000000000001", "1e6", undefined]) assert.equal(parseAmount(bad), null, String(bad));
});

test("고정지출: 정상 입력 정규화 (월 주기면 납부 월은 버림, 빈 값은 null)", () => {
  const r = parseFixedInput({ name: "  관리비 ", category: "housing", amount: "120,000", cycle: "monthly", billing_day: "31", billing_month: "3", active: "on" }, TODAY);
  assert.ok(r.ok);
  assert.deepEqual(r.value, {
    name: "관리비",
    category: "housing",
    amount: 120_000,
    cycle: "monthly",
    billingDay: 31,
    billingMonth: null,
    paymentMethod: null,
    institution: null,
    startDate: null,
    endDate: null,
    active: true,
    note: null,
    source: "manual",
  });
});

test("고정지출: 남은 횟수는 저장 시 종료일로 정규화 (다음 납부일 + N−1 개월)", () => {
  const r = parseFixedInput({ name: "대출", category: "loan", amount: "300000", billing_day: "15", remaining_count: "9", end_date: "2030-01-01" }, TODAY);
  assert.ok(r.ok);
  assert.equal(r.value.endDate, "2027-06-15", "남은 횟수가 종료일 입력보다 우선");
  const noDay = parseFixedInput({ name: "대출", category: "loan", amount: "1", remaining_count: "3" }, TODAY);
  assert.ok(!noDay.ok);
  assert.ok("remaining_count" in noDay.errors);
});

test("고정지출: 범위·enum·날짜·길이 오류를 필드별로 알려 준다", () => {
  const r = parseFixedInput(
    {
      name: "x".repeat(101),
      category: "casino",
      amount: "-5",
      cycle: "weekly",
      billing_day: "32",
      payment_method: "cash",
      start_date: "2026-02-30",
      end_date: "2026-13-01",
      note: "n".repeat(501),
      source: "robot",
    },
    TODAY,
  );
  assert.ok(!r.ok);
  for (const key of ["name", "category", "amount", "cycle", "billing_day", "payment_method", "start_date", "end_date", "note", "source"]) {
    assert.ok(key in r.errors, key);
  }
  const yearly = parseFixedInput({ name: "자동차세", category: "tax", amount: "300000", cycle: "yearly", billing_day: "30" }, TODAY);
  assert.ok(!yearly.ok && "billing_month" in yearly.errors, "연 주기 + 납부일이면 납부 월 필요");
  const reversed = parseFixedInput({ name: "a", category: "other", amount: "1", start_date: "2026-05-01", end_date: "2026-04-01" }, TODAY);
  assert.ok(!reversed.ok && "end_date" in reversed.errors);
});

test("소유자 필드는 입력에서 읽지 않는다: user_id·userId 를 보내도 결과에 없다", () => {
  const r = parseFixedInput({ name: "a", category: "other", amount: "1", user_id: "00000000-0000-0000-0000-000000000001", userId: "x" }, TODAY);
  assert.ok(r.ok);
  assert.equal("user_id" in r.value, false);
  assert.equal("userId" in r.value, false);
  const b = parseBalanceInput({ kind: "asset", category: "cash", name: "a", amount: "1", user_id: "x" });
  assert.ok(b.ok && !("user_id" in b.value));
});

test("자산·부채: 분류는 구분과 짝이 맞아야 하고, 자산이면 부채 전용 필드를 버린다", () => {
  const asset = parseBalanceInput({ kind: "asset", category: "deposit", name: "예금", amount: "1000", monthly_payment: "50", interest_rate: "3.5", end_date: "2030-01-01" });
  assert.ok(asset.ok);
  assert.equal(asset.value.monthlyPayment, null);
  assert.equal(asset.value.interestRate, null);
  assert.equal(asset.value.endDate, null);
  const loan = parseBalanceInput({ kind: "liability", category: "loan", name: "대출", amount: "1000", monthly_payment: "50", interest_rate: "4.125%", end_date: "2031-03-15" });
  assert.ok(loan.ok);
  assert.equal(loan.value.interestRate, 4.125);
  const mismatch = parseBalanceInput({ kind: "asset", category: "loan", name: "x", amount: "1" });
  assert.ok(!mismatch.ok && "category" in mismatch.errors);
  const badRate = parseBalanceInput({ kind: "liability", category: "loan", name: "x", amount: "1", interest_rate: "101" });
  assert.ok(!badRate.ok && "interest_rate" in badRate.errors);
});

const fx = (o: Partial<FixedExpense>): FixedExpense => ({
  id: "f",
  name: "x",
  category: "other",
  amount: 0,
  cycle: "monthly",
  billingDay: null,
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

test("요약: 효력 있는 항목만 합산, 분류별 비중은 큰 순, 순자산 = 자산 − 부채", () => {
  const items = [
    fx({ id: "a", category: "housing", amount: 500_000, billingDay: 25 }),
    fx({ id: "b", category: "insurance", amount: 1_200_000, cycle: "yearly", billingDay: 1, billingMonth: 11 }),
    fx({ id: "c", category: "telecom", amount: 50_000, active: false }),
    fx({ id: "d", category: "loan", amount: 300_000, billingDay: 20, endDate: "2026-01-20" }),
  ];
  const s = summarizeFixed(items, TODAY);
  assert.equal(s.activeCount, 2);
  assert.equal(s.monthlyTotal, 600_000);
  assert.equal(s.annualTotal, 7_200_000);
  assert.deepEqual(s.byCategory.map((c) => c.category), ["housing", "insurance"]);
  assert.deepEqual(s.upcoming.map((u) => u.date), ["2026-10-25", "2026-11-01"]);
  const balances: BalanceItem[] = [
    { id: "1", kind: "asset", category: "deposit", name: "a", amount: 10_000_000, asOf: null, note: null, monthlyPayment: null, interestRate: null, endDate: null },
    { id: "2", kind: "liability", category: "loan", name: "b", amount: 4_000_000, asOf: null, note: null, monthlyPayment: 200_000, interestRate: 4, endDate: "2027-01-15" },
  ];
  assert.deepEqual(summarizeBalances(balances), { assetsTotal: 10_000_000, liabilitiesTotal: 4_000_000, netWorth: 6_000_000 });
  const timeline = debtTimeline(items, balances, TODAY);
  assert.deepEqual(timeline.map((d) => [d.kind, d.remainingCount, d.remainingTotal]), [["liability", 4, 800_000]]);
});
