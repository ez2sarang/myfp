// 납부 일정 계산 (Asia/Seoul 달력 날짜, 말일 처리) 시험.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysInMonth, dueDay, seoulToday } from "../src/lib/finance/dates.ts";
import {
  endDateFromRemainingCount,
  isInEffect,
  monthlyEquivalent,
  nextBillingDate,
  remainingCommittedTotal,
  remainingPayments,
  upcomingPayments,
  type ScheduleItem,
} from "../src/lib/finance/schedule.ts";

const monthly = (billingDay: number | null, extra: Partial<ScheduleItem> = {}): ScheduleItem => ({
  amount: 100_000,
  cycle: "monthly",
  billingDay,
  billingMonth: null,
  startDate: null,
  endDate: null,
  ...extra,
});

test("서울 날짜: UTC 15시 이후는 다음 날", () => {
  assert.equal(seoulToday(new Date("2026-10-11T14:59:59Z")), "2026-10-11");
  assert.equal(seoulToday(new Date("2026-10-11T15:00:00Z")), "2026-10-12");
  assert.equal(seoulToday(new Date("2026-12-31T15:30:00Z")), "2027-01-01");
});

test("말일 처리: 31일·30일·29일 납부는 그 달에 없으면 말일", () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(dueDay(2026, 2, 31), 28);
  assert.equal(dueDay(2028, 2, 30), 29);
  assert.equal(dueDay(2026, 4, 31), 30);
  assert.equal(dueDay(2026, 1, 31), 31);
});

test("다음 납부일: 오늘 포함, 지났으면 다음 달, 말일 규칙 적용", () => {
  assert.equal(nextBillingDate(monthly(20), "2026-10-12"), "2026-10-20");
  assert.equal(nextBillingDate(monthly(12), "2026-10-12"), "2026-10-12", "오늘이 납부일이면 오늘");
  assert.equal(nextBillingDate(monthly(5), "2026-10-12"), "2026-11-05");
  assert.equal(nextBillingDate(monthly(31), "2026-02-01"), "2026-02-28");
  assert.equal(nextBillingDate(monthly(31), "2026-03-01"), "2026-03-31");
  assert.equal(nextBillingDate(monthly(30), "2026-12-31"), "2027-01-30", "연도 넘김");
  assert.equal(nextBillingDate(monthly(null), "2026-10-12"), null, "납부일 미정");
});

test("다음 납부일: 시작일 이전은 건너뛰고, 종료일 이후면 없음", () => {
  assert.equal(nextBillingDate(monthly(20, { startDate: "2026-12-01" }), "2026-10-12"), "2026-12-20");
  assert.equal(nextBillingDate(monthly(20, { endDate: "2026-10-19" }), "2026-10-12"), null);
  assert.equal(nextBillingDate(monthly(20, { endDate: "2026-10-20" }), "2026-10-12"), "2026-10-20");
});

test("연 주기: 납부 월의 납부일, 지났으면 내년. 납부 월이 없으면 계산하지 않는다", () => {
  const yearly = (month: number | null): ScheduleItem => ({ ...monthly(15), cycle: "yearly", billingMonth: month, amount: 1_200_000 });
  assert.equal(nextBillingDate(yearly(11), "2026-10-12"), "2026-11-15");
  assert.equal(nextBillingDate(yearly(3), "2026-10-12"), "2027-03-15");
  assert.equal(nextBillingDate({ ...yearly(2), billingDay: 31 }, "2027-01-01"), "2027-02-28");
  assert.equal(nextBillingDate(yearly(null), "2026-10-12"), null);
});

test("월 환산: 연 주기는 12로 나눠 반올림 (월 단위 정규화), 월 주기는 그대로", () => {
  assert.equal(monthlyEquivalent({ amount: 100_000, cycle: "monthly" }), 100_000);
  assert.equal(monthlyEquivalent({ amount: 1_000_000, cycle: "yearly" }), 83_333);
  assert.equal(monthlyEquivalent({ amount: 100, cycle: "yearly" }), 8);
});

test("남은 횟수·남은 납입 총액: 오늘부터 종료일까지(양 끝 포함), 무기한·미정은 null", () => {
  const item = monthly(15, { endDate: "2027-06-15", amount: 50_000 });
  assert.equal(remainingPayments(item, "2026-10-12"), 9);
  assert.equal(remainingCommittedTotal(item, "2026-10-12"), 450_000);
  assert.equal(remainingPayments(item, "2026-10-16"), 8);
  assert.equal(remainingPayments(item, "2027-06-16"), 0);
  assert.equal(remainingPayments(monthly(20), "2026-10-12"), null, "종료일 없음");
  assert.equal(remainingCommittedTotal(monthly(20), "2026-10-12"), null);
  assert.equal(remainingPayments(monthly(null, { endDate: "2027-01-01" }), "2026-10-12"), null, "납부일 미정");
});

test("남은 횟수 → 종료일 정규화: 다음 납부일 + (N−1)개월, 말일 규칙", () => {
  assert.equal(endDateFromRemainingCount({ count: 9, cycle: "monthly", billingDay: 15, billingMonth: null, asOf: "2026-10-12" }), "2027-06-15");
  assert.equal(endDateFromRemainingCount({ count: 1, cycle: "monthly", billingDay: 15, billingMonth: null, asOf: "2026-10-12" }), "2026-10-15");
  assert.equal(endDateFromRemainingCount({ count: 2, cycle: "monthly", billingDay: 31, billingMonth: null, asOf: "2026-01-31" }), "2026-02-28");
  assert.equal(endDateFromRemainingCount({ count: 3, cycle: "monthly", billingDay: 5, billingMonth: null, asOf: "2026-10-12" }), "2027-01-05");
  assert.equal(endDateFromRemainingCount({ count: 3, cycle: "yearly", billingDay: 10, billingMonth: 4, asOf: "2026-10-12" }), "2029-04-10");
  assert.equal(endDateFromRemainingCount({ count: 0, cycle: "monthly", billingDay: 5, billingMonth: null, asOf: "2026-10-12" }), null);
  assert.equal(endDateFromRemainingCount({ count: 3, cycle: "monthly", billingDay: null, billingMonth: null, asOf: "2026-10-12" }), null);
  // 정규화한 종료일로 다시 세면 같은 횟수
  const end = endDateFromRemainingCount({ count: 9, cycle: "monthly", billingDay: 31, billingMonth: null, asOf: "2026-10-12" });
  assert.equal(remainingPayments(monthly(31, { endDate: end }), "2026-10-12"), 9);
});

test("다음 30일 일정: 활성·미보관만, 날짜순, 30일 창 안에 두 번 오는 납부도 포함", () => {
  const items = [
    { ...monthly(1), name: "가", active: true, archived: false },
    { ...monthly(25), name: "나", active: true, archived: false },
    { ...monthly(10), name: "비활성", active: false, archived: false },
    { ...monthly(10), name: "보관", active: true, archived: true },
    { ...monthly(null), name: "미정", active: true, archived: false },
  ];
  const list = upcomingPayments(items, "2026-02-01", 30);
  assert.deepEqual(
    list.map((u) => [u.item.name, u.date, u.daysLeft]),
    [
      ["가", "2026-02-01", 0],
      ["나", "2026-02-25", 24],
      ["가", "2026-03-01", 28],
    ],
  );
  assert.equal(addDays("2026-02-01", 30), "2026-03-03");
  assert.equal(upcomingPayments(items, "2026-10-12", 30).every((u) => u.date >= "2026-10-12" && u.date < "2026-11-11"), true);
});

test("효력 판정: 비활성·보관·시작 전·종료 후는 합계에서 빠진다", () => {
  const base = { active: true, archived: false, startDate: null, endDate: null };
  assert.equal(isInEffect(base, "2026-10-12"), true);
  assert.equal(isInEffect({ ...base, active: false }, "2026-10-12"), false);
  assert.equal(isInEffect({ ...base, archived: true }, "2026-10-12"), false);
  assert.equal(isInEffect({ ...base, startDate: "2026-10-13" }, "2026-10-12"), false);
  assert.equal(isInEffect({ ...base, endDate: "2026-10-11" }, "2026-10-12"), false);
  assert.equal(isInEffect({ ...base, endDate: "2026-10-12" }, "2026-10-12"), true);
});
