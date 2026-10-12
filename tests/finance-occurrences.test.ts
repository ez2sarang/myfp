// 월별 발생 계산: 월 경계·윤년·말일·연 주기·과거 달 active 무시·덮어쓰기·예정지출·분할·이번 달 납부 완료/남음·쿼리 검증.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixedOccurrenceIn,
  installmentDates,
  monthDiff,
  monthOccurrences,
  monthTiming,
  monthTotals,
  monthsBetween,
  nextInMonth,
  occurrenceDetails,
  parseMonthParam,
  shiftMonth,
  summarizeMonth,
  type FixedOverride,
  type PlannedExpense,
} from "../src/lib/finance/occurrences.ts";
import type { FixedExpense } from "../src/lib/finance/types.ts";

const TODAY = "2026-10-12";

function fx(over: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id: "f1",
    name: "가상 항목",
    category: "telecom",
    amount: 50_000,
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
    ...over,
  };
}

function pl(over: Partial<PlannedExpense> = {}): PlannedExpense {
  return { id: "p1", dueDate: "2026-10-20", name: "가상 예정", category: "tax", amount: 30_000, status: "planned", note: null, groupId: null, seq: null, total: null, ...over };
}

test("달 계산: 이동·차이·범위·이번 달/과거/미래", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(monthDiff("2027-02", "2026-10"), 4);
  assert.deepEqual(monthsBetween("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthsBetween("2027-01", "2026-12"), []);
  assert.deepEqual(["2026-09", "2026-10", "2026-11"].map((m) => monthTiming(m, TODAY)), ["past", "current", "future"]);
});

test("말일 규칙·윤년: 31일 납부는 2월 말일(평년 28·윤년 29), 30일 달은 30일", () => {
  const item = fx({ billingDay: 31 });
  assert.equal(fixedOccurrenceIn(item, "2027-02", TODAY)?.date, "2027-02-28");
  assert.equal(fixedOccurrenceIn(item, "2028-02", TODAY)?.date, "2028-02-29");
  assert.equal(fixedOccurrenceIn(item, "2026-11", TODAY)?.date, "2026-11-30");
  assert.equal(fixedOccurrenceIn(fx({ billingDay: 29 }), "2027-02", TODAY)?.date, "2027-02-28");
});

test("시작·종료일 경계: 납부일이 기간 안이어야 한다 (경계 포함)", () => {
  const item = fx({ billingDay: 15, startDate: "2026-11-15", endDate: "2027-01-15" });
  assert.equal(fixedOccurrenceIn(item, "2026-10", TODAY), null);
  assert.equal(fixedOccurrenceIn(item, "2026-11", TODAY)?.date, "2026-11-15");
  assert.equal(fixedOccurrenceIn(item, "2027-01", TODAY)?.date, "2027-01-15");
  assert.equal(fixedOccurrenceIn(item, "2027-02", TODAY), null);
  assert.equal(fixedOccurrenceIn(fx({ billingDay: 15, startDate: "2026-11-16" }), "2026-11", TODAY), null, "시작일이 납부일보다 뒤면 그 달은 없음");
  assert.equal(fixedOccurrenceIn(fx({ billingDay: 15, endDate: "2026-11-14" }), "2026-11", TODAY), null, "종료일이 납부일보다 앞이면 없음");
});

test("연 주기: 납부 월에만 전액, 납부 월 미정은 매달 12분의 1(반올림)", () => {
  const yearly = fx({ cycle: "yearly", billingMonth: 6, billingDay: 30, amount: 120_000 });
  assert.equal(fixedOccurrenceIn(yearly, "2027-05", TODAY), null);
  assert.deepEqual(fixedOccurrenceIn(yearly, "2027-06", TODAY), { date: "2027-06-30", amount: 120_000 });
  assert.deepEqual(fixedOccurrenceIn(fx({ cycle: "yearly", billingMonth: null, billingDay: null, amount: 100_000 }), "2027-03", TODAY), { date: null, amount: 8333 });
});

test("active·보관은 이번 달·미래 달에만 적용, 과거 달은 시작·종료일로만 판정", () => {
  const off = fx({ active: false, startDate: "2026-01-01" });
  assert.equal(fixedOccurrenceIn(off, "2026-10", TODAY), null);
  assert.equal(fixedOccurrenceIn(off, "2026-12", TODAY), null);
  assert.equal(fixedOccurrenceIn(off, "2026-09", TODAY)?.date, "2026-09-15", "과거 달에는 비활성이어도 남는다");
  assert.equal(fixedOccurrenceIn(fx({ archived: true }), "2026-08", TODAY)?.date, "2026-08-15");
  assert.equal(fixedOccurrenceIn(fx({ active: false, startDate: "2026-09-20" }), "2026-09", TODAY), null, "과거라도 기간 밖이면 없음");
});

test("덮어쓰기: 금액 변경은 그 달만, 건너뜀은 합계에서 빠지고 목록에는 남는다", () => {
  const items = [fx({ id: "a", amount: 10_000 }), fx({ id: "b", amount: 20_000, billingDay: 5 })];
  const overrides: FixedOverride[] = [
    { fixedExpenseId: "a", month: "2026-11", amount: 15_000, skipped: false },
    { fixedExpenseId: "b", month: "2026-11", amount: null, skipped: true },
    { fixedExpenseId: "zzz", month: "2026-11", amount: 999, skipped: false },
  ];
  const nov = monthOccurrences(items, overrides, [], "2026-11", TODAY);
  assert.equal(nov.length, 2, "다른 항목의 덮어쓰기는 무시");
  const a = nov.find((o) => o.id === "a")!;
  assert.deepEqual([a.amount, a.baseAmount, a.overridden], [15_000, 10_000, true]);
  assert.equal(nov.find((o) => o.id === "b")!.state, "skipped");
  const s = summarizeMonth(nov, "2026-11", TODAY);
  assert.deepEqual([s.total, s.fixedTotal, s.skippedCount], [15_000, 15_000, 1]);
  const dec = summarizeMonth(monthOccurrences(items, overrides, [], "2026-12", TODAY), "2026-12", TODAY);
  assert.equal(dec.total, 30_000, "다음 달은 원래 금액");
});

test("이번 달: 오늘 이전은 납부 완료, 오늘부터는 남음 / 과거 달 전부 완료 / 미래 달 예정 / 예정지출 납부 처리·건너뜀", () => {
  const items = [fx({ id: "early", billingDay: 5, amount: 1_000 }), fx({ id: "today", billingDay: 12, amount: 2_000 }), fx({ id: "late", billingDay: 25, amount: 4_000 })];
  const planned = [pl({ id: "p-paid", dueDate: "2026-10-28", status: "paid", amount: 8_000 }), pl({ id: "p-skip", dueDate: "2026-10-03", status: "skipped", amount: 16_000 })];
  const occ = monthOccurrences(items, [], planned, "2026-10", TODAY);
  const state = Object.fromEntries(occ.map((o) => [o.id, o.state]));
  assert.deepEqual(state, { early: "paid", today: "due", late: "due", "p-paid": "paid", "p-skip": "skipped" });
  const s = summarizeMonth(occ, "2026-10", TODAY);
  assert.deepEqual([s.paidTotal, s.remainingTotal, s.plannedTotal, s.total], [9_000, 6_000, 8_000, 15_000]);
  assert.equal(nextInMonth(occ, "2026-10", TODAY)?.id, "today");
  assert.equal(nextInMonth(occ, "2026-10", TODAY)?.daysLeft, 0);
  assert.ok(monthOccurrences(items, [], [], "2026-09", TODAY).every((o) => o.state === "paid"));
  assert.ok(monthOccurrences(items, [], [], "2026-11", TODAY).every((o) => o.state === "planned"));
  assert.equal(nextInMonth(monthOccurrences(items, [], [], "2026-09", TODAY), "2026-09", TODAY), null);
});

test("고정과 예정을 나눠 합산하고, 여러 달 추이는 달마다 계산한다", () => {
  const totals = monthTotals([fx({ amount: 10_000 })], [], [pl({ dueDate: "2026-11-02", amount: 5_000 })], ["2026-10", "2026-11"], TODAY);
  assert.deepEqual(totals, [
    { month: "2026-10", fixed: 10_000, planned: 0, total: 10_000 },
    { month: "2026-11", fixed: 10_000, planned: 5_000, total: 15_000 },
  ]);
});

test("분할 날짜: 같은 날짜로 매달, 그 달에 없는 날은 말일, 연도 넘김", () => {
  assert.deepEqual(installmentDates("2026-11-30", 4), ["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]);
  assert.deepEqual(installmentDates("2027-12-31", 3), ["2027-12-31", "2028-01-31", "2028-02-29"]);
  assert.equal(installmentDates("2026-10-01", 36).length, 36);
});

test("?month= 검증: 형식·범위 밖은 기본값", () => {
  const range = { min: "2025-01", max: "2027-10", fallback: "2026-10" };
  assert.equal(parseMonthParam("2026-03", range), "2026-03");
  assert.equal(parseMonthParam(["2025-01", "x"], range), "2025-01");
  for (const bad of [undefined, "", "2026-13", "2026-00", "2026-1", "2024-12", "2027-11", "2026-03-01", "<script>"]) assert.equal(parseMonthParam(bad, range), "2026-10", String(bad));
});

test("세부 항목 정렬·필터: 금액 내림차순 기본, 날짜 미정은 날짜순 맨 뒤, 분류 필터는 있는 분류만", () => {
  const occ = monthOccurrences(
    [fx({ id: "a", name: "가", amount: 3_000, billingDay: 20 }), fx({ id: "b", name: "나", amount: 9_000, billingDay: null, category: "insurance" })],
    [],
    [pl({ id: "c", name: "다", amount: 5_000, dueDate: "2026-10-01" })],
    "2026-10",
    TODAY,
  );
  assert.deepEqual(occurrenceDetails(occ, { sort: "amount", dir: "desc", cat: null }).rows.map((r) => r.id), ["b", "c", "a"]);
  assert.deepEqual(occurrenceDetails(occ, { sort: "date", dir: "asc", cat: null }).rows.map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(occurrenceDetails(occ, { sort: "date", dir: "desc", cat: null }).rows.map((r) => r.id), ["a", "c", "b"]);
  const filtered = occurrenceDetails(occ, { sort: "name", dir: "asc", cat: "insurance" });
  assert.deepEqual([filtered.rows.map((r) => r.id), filtered.total], [["b"], 9_000]);
  assert.equal(occurrenceDetails(occ, { sort: "name", dir: "asc", cat: "housing" }).query.cat, null, "없는 분류는 무시");
});

test("시작일이 없는 항목은 등록일(서울)이 속한 달부터만 발생한다. 시작일이 있으면 기존대로", () => {
  const noStart = fx({ id: "n", billingDay: 5, createdOn: "2026-08-20" });
  assert.equal(fixedOccurrenceIn(noStart, "2026-07", TODAY), null, "등록 전 달은 0");
  assert.equal(fixedOccurrenceIn(noStart, "2026-08", TODAY)?.date, "2026-08-05", "등록 달부터 (그 달 전체)");
  assert.equal(monthOccurrences([noStart], [], [], "2026-06", TODAY).length, 0);
  assert.equal(summarizeMonth(monthOccurrences([noStart], [], [], "2026-07", TODAY), "2026-07", TODAY).paidTotal, 0, "등록 전 달에 납부 완료 합계 없음");
  const withStart = fx({ id: "s", billingDay: 5, startDate: "2026-01-01", createdOn: "2026-08-20" });
  assert.equal(fixedOccurrenceIn(withStart, "2026-03", TODAY)?.date, "2026-03-05", "시작일이 명시되면 등록일과 무관");
});
