// 인식 글자 정규화: 금액(형식·오인식 보정·만 단위), 날짜(세 형식·연도 추정·말일), 할부·취소 신호. 가상 값만 사용.
import assert from "node:assert/strict";
import { test } from "node:test";
import { amountsIn, dateFromDay, isCancelText, parseAmount, parseDate, parseInstallment } from "../src/lib/import/normalize.ts";

const TODAY = "2026-10-12";

test("금액: 천 단위 쉼표 형식, 부호·₩·원", () => {
  assert.deepEqual(parseAmount("12,000원"), { value: 12000, negative: false, corrected: false, valid: true, hasWon: true });
  assert.deepEqual(parseAmount("-3,500원"), { value: 3500, negative: true, corrected: false, valid: true, hasWon: true });
  assert.deepEqual(parseAmount("₩1,234,567"), { value: 1234567, negative: false, corrected: false, valid: true, hasWon: false });
  assert.deepEqual(parseAmount(" 900 원 "), { value: 900, negative: false, corrected: false, valid: true, hasWon: true });
  assert.equal(parseAmount("가상커피"), null);
  assert.equal(parseAmount("2026.10.03 08:15"), null);
});

test("금액 보정: 숫자 사이 O/o→0, l/I/|→1, 천 단위 자리의 . ' ’ → , (보정하면 corrected)", () => {
  assert.deepEqual(parseAmount("1O,5o0원"), { value: 10500, negative: false, corrected: true, valid: true, hasWon: true });
  assert.deepEqual(parseAmount("1l,2I0원"), { value: 11210, negative: false, corrected: true, valid: true, hasWon: true });
  assert.deepEqual(parseAmount("3|,000원"), { value: 31000, negative: false, corrected: true, valid: true, hasWon: true });
  assert.deepEqual(parseAmount("12.000원"), { value: 12000, negative: false, corrected: true, valid: true, hasWon: true });
  assert.deepEqual(parseAmount("12’500원"), { value: 12500, negative: false, corrected: true, valid: true, hasWon: true });
  assert.deepEqual(parseAmount("1'234'000"), { value: 1234000, negative: false, corrected: true, valid: true, hasWon: false });
});

test("금액 형식 위반: 쉼표 없는 네 자리 이상·잘못된 묶음·소수점은 valid=false", () => {
  assert.equal(parseAmount("12000원")?.valid, false);
  assert.equal(parseAmount("12000원")?.value, 12000);
  assert.equal(parseAmount("1,23,000원")?.valid, false);
  assert.equal(parseAmount("12.5원")?.valid, false);
});

test("글자 안의 금액들: 괄호 밖만 고르기, 만 단위", () => {
  assert.deepEqual(amountsIn("점심 12,000 (3만원)", { outsideParens: true }).map((a) => a.value), [12000]);
  assert.deepEqual(amountsIn("점심 12,000 (3만원)").map((a) => a.value), [12000, 30000]);
  const man = amountsIn("잔액 3000만원")[0]!;
  assert.equal(man.value, 30_000_000);
  assert.equal(man.valid, true);
  assert.equal(man.hasWon, true);
});

test("날짜 세 형식과 시각", () => {
  assert.equal(parseDate("10월 3일", TODAY)?.date, "2026-10-03");
  assert.equal(parseDate("10월 3일", TODAY)?.format, "md");
  const ymd = parseDate("2026.10.03 14:21", TODAY);
  assert.equal(ymd?.date, "2026-10-03");
  assert.equal(ymd?.time, "14:21");
  assert.equal(ymd?.hasYear, true);
  assert.equal(parseDate("2026-1-5", TODAY)?.date, "2026-01-05");
  assert.equal(parseDate("2026/01/05", TODAY)?.date, "2026-01-05");
  const weekday = parseDate("10.11 (토)", TODAY);
  assert.equal(weekday?.date, "2026-10-11");
  assert.equal(weekday?.format, "md-weekday");
  assert.equal(parseDate("가상마트", TODAY), null);
});

test("연도 추정: 연도가 없으면 캡처일의 연도, 그 결과가 미래면 전년", () => {
  assert.equal(parseDate("12월 25일", TODAY)?.date, "2025-12-25");
  assert.equal(parseDate("10월 12일", TODAY)?.date, "2026-10-12", "오늘은 미래가 아니다");
  assert.equal(parseDate("10월 13일", TODAY)?.date, "2025-10-13");
  assert.equal(parseDate("12월 31일", "2026-01-03")?.date, "2025-12-31");
  assert.equal(parseDate("2027.01.01", TODAY)?.date, "2027-01-01", "연도가 적혀 있으면 그대로");
});

test("말일 검사: 범위 밖이면 date=null, dayInRange=false", () => {
  const bad = parseDate("2월 30일", TODAY);
  assert.equal(bad?.date, null);
  assert.equal(bad?.dayInRange, false);
  assert.equal(parseDate("2024년 2월 29일", TODAY)?.date, "2024-02-29");
  assert.equal(parseDate("2025년 2월 29일", TODAY)?.date, null);
  assert.equal(parseDate("13월 1일", TODAY)?.date, null);
  assert.equal(parseDate("2026.11.31", TODAY)?.dayInRange, false);
});

test("월 맥락 + 일(손글씨): 그 달이 캡처일보다 뒤면 전년, 일은 말일 이내", () => {
  assert.deepEqual(dateFromDay(10, 31, TODAY), { date: "2026-10-31", dayInRange: true });
  assert.deepEqual(dateFromDay(11, 5, TODAY), { date: "2025-11-05", dayInRange: true });
  assert.deepEqual(dateFromDay(11, 31, TODAY), { date: null, dayInRange: false });
  assert.deepEqual(dateFromDay(2, 29, TODAY), { date: null, dayInRange: false });
});

test("할부·취소 신호", () => {
  assert.deepEqual(parseInstallment("2026.10.03 할부 3/6회"), { current: 3, total: 6 });
  assert.deepEqual(parseInstallment("6개월 할부"), { current: null, total: 6 });
  assert.deepEqual(parseInstallment("할부"), { current: null, total: null });
  assert.equal(parseInstallment("일시불"), null);
  assert.equal(parseInstallment("7/6회"), null);
  assert.equal(isCancelText("승인취소"), true);
  assert.equal(isCancelText("승인"), false);
});
