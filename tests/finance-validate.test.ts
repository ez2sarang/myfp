// 입력 검증·정규화 시험 (서버 액션과 시드 적재가 같은 규칙을 쓴다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, parseAmount, parseBalanceInput, parseFixedInput, stripInvisible } from "../src/lib/finance/validate.ts";
import { parsePlannedInput } from "../src/lib/finance/monthly-validate.ts";

test("이름 정리: 보이지 않는 문자는 지우고(거부 아님), 이모지 사이 ZWJ 만 남긴다", () => {
  assert.equal(cleanText("엄마\u200B", 100), "엄마");
  assert.equal(cleanText("\u200E가상\u00AD마트\uFEFF", 100), "가상마트", "방향 표시·소프트 하이픈·BOM");
  assert.equal(cleanText("가상\u{E0041}\u{E007F}마트", 100), "가상마트", "태그 문자");
  assert.equal(cleanText("가\u3164상\u115F\u1160마\uFFA0트", 100), "가상마트", "한글 채움 문자");
  assert.equal(cleanText("가상\u200D마트", 100), "가상마트", "이모지 사이가 아닌 ZWJ");
  assert.equal(stripInvisible("\u{1F469}\u200D\u{1F4BB}"), "\u{1F469}\u200D\u{1F4BB}", "\u{1F469}\u200D\u{1F4BB} 유지");
  assert.equal(stripInvisible("\u2764\uFE0F\u200D\u{1F525}"), "\u2764\uFE0F\u200D\u{1F525}", "\u2764\uFE0F\u200D\u{1F525} (변형 선택자 뒤) 유지");
  assert.equal(stripInvisible("\u{1F469}\u{1F3FD}\u200D\u{1F4BB}"), "\u{1F469}\u{1F3FD}\u200D\u{1F4BB}", "피부색 뒤 유지");
  assert.equal(cleanText("\u200B\u3164 \u200D", 100), null, "지우고 나면 빈 이름");
  assert.equal(cleanText("가".repeat(100) + "\u200B", 100), "가".repeat(100), "길이는 지운 뒤 잰다");
});

test("수동 폼(고정지출·자산·예정지출)도 같은 정리: 지우고 나서 비면 '이름을 입력해 주세요'", () => {
  const invisible = "\u200B\u3164\uFEFF";
  const fixed = parseFixedInput({ name: invisible, category: "telecom", amount: "1000" }, "2026-10-12");
  assert.equal(fixed.ok, false);
  if (!fixed.ok) assert.equal(fixed.errors.name, "이름을 입력해 주세요.");
  const balance = parseBalanceInput({ kind: "asset", category: "deposit", name: invisible, amount: "1000" });
  assert.equal(balance.ok, false);
  if (!balance.ok) assert.equal(balance.errors.name, "이름을 입력해 주세요.");
  const planned = parsePlannedInput({ name: invisible, category: "other", amount: "1000", dueDate: "2026-10-20" }, "2026-10-12", { allowCount: false });
  assert.equal(planned.ok, false);
  if (!planned.ok) assert.equal(planned.errors.name, "이름을 입력해 주세요.");
  const ok = parseFixedInput({ name: "엄마\u200B 통신", category: "telecom", amount: "1000" }, "2026-10-12");
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.value.name, "엄마 통신");
});
import { remainingThisMonth, summarizeBalances, summarizeFixed, debtTimeline } from "../src/lib/finance/summary.ts";
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
    private: false,
  });
  const own = parseFixedInput({ name: "a", category: "other", amount: "1", private: "on" }, TODAY);
  assert.ok(own.ok && own.value.private === true, "나만 보기 체크박스");
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
  assert.equal(s.remainingThisMonth, 500_000, "이번 달 남은 납부: 10-25 주거만 (보험은 11월)");
  assert.equal(s.remainingThisMonthCount, 1);
  assert.equal("annualTotal" in s, false, "연 환산은 내지 않는다");
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

test("이번 달 남은 납부액: 오늘 포함 ~ 이달 말일, 다음 달 1일 제외, 말일 규칙, 연 주기는 납부 월만, 비활성 제외", () => {
  const items = [
    fx({ id: "a", name: "오늘", amount: 1_000, billingDay: 12 }),
    fx({ id: "b", name: "지남", amount: 2_000, billingDay: 5 }),
    fx({ id: "c", name: "말일", amount: 4_000, billingDay: 31 }),
    fx({ id: "d", name: "다음달1일", amount: 8_000, billingDay: 1 }),
    fx({ id: "e", name: "연 이번달", amount: 16_000, cycle: "yearly", billingMonth: 10, billingDay: 20 }),
    fx({ id: "f", name: "연 다른달", amount: 32_000, cycle: "yearly", billingMonth: 3, billingDay: 20 }),
    fx({ id: "g", name: "꺼짐", amount: 64_000, billingDay: 20, active: false }),
    fx({ id: "h", name: "미정", amount: 128_000, billingDay: null }),
  ];
  assert.deepEqual(remainingThisMonth(items, "2026-10-12"), { remainingThisMonth: 21_000, remainingThisMonthCount: 3 });
  assert.deepEqual(remainingThisMonth(items, "2026-10-31"), { remainingThisMonth: 4_000, remainingThisMonthCount: 1 }, "말일 당일");
  assert.deepEqual(remainingThisMonth([fx({ amount: 5, billingDay: 31 })], "2027-02-01"), { remainingThisMonth: 5, remainingThisMonthCount: 1 }, "2월 말일");
});
