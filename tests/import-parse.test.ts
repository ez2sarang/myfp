// 인식 줄 → 항목 초안 파서 4종(카드 앱 목록·영수증·관리비 고지서 표·손글씨 메모)과 레이아웃 추정. 합성 상자·가상 이름·가상 금액만 쓴다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLayout, groupRows, layoutItems, parseBillTable, parseCardList, parseHandwriting, parseReceipt } from "../src/lib/import/parse.ts";
import { BILL_CAPTURE, CARD_CAPTURE, line, MEMO_CAPTURE, PHOTO, RECEIPT_CAPTURE, row, SHOT } from "./import-fixtures.ts";

test("기울기 보정: 3도 기운 표도 같은 행으로 묶인다", () => {
  const angle = (3 * Math.PI) / 180;
  const lines = [line("일반관리비", 50, 200, 200, 224, angle), line("52,000", 420, 200, 500, 224, angle), line("전기료", 50, 240, 200, 264, angle), line("28,000", 420, 240, 500, 264, angle)];
  const rows = groupRows(layoutItems(lines));
  assert.deepEqual(rows.map((r) => r.map((x) => x.text)), [["일반관리비", "52,000"], ["전기료", "28,000"]]);
});

test("카드 앱 목록: 오른쪽 금액원 상자가 행 기준, 날짜는 아래 줄 → 없으면 위쪽 헤더, 할부·취소 신호", () => {
  const drafts = parseCardList(CARD_CAPTURE, SHOT);
  assert.deepEqual(
    drafts.map((d) => [d.name, d.amount?.value, d.date, d.time, d.dateSource]),
    [
      ["가상커피 본점", 4500, "2026-10-03", "08:15", "direct"],
      ["가상마트", 32000, "2026-10-03", null, "header"],
      ["가상통신", 55000, "2026-10-03", "09:00", "direct"],
      ["가상가전", 120000, "2026-10-03", "10:00", "direct"],
      ["가상커피 본점", 4500, "2026-10-03", "08:20", "direct"],
      ["현금서비스", 300000, "2026-10-03", "11:00", "direct"],
      ["가상서점", 10500, "2026-10-03", "12:00", "direct"],
    ],
  );
  assert.deepEqual(drafts[3]!.installment, { current: 3, total: 6 });
  assert.equal(drafts[4]!.cancelled, true);
  assert.equal(drafts.filter((d) => d.cancelled).length, 1);
  assert.equal(drafts[6]!.amount?.corrected, true);
  assert.ok(drafts.every((d) => d.lines.length >= 2 && d.box !== null));
});

test("카드 앱 목록: 헤더가 화면 밖이면 직전 캡처의 날짜를 이어받고, 그것도 없으면 날짜 없음", () => {
  const lines = row(140, "가상마트", "32,000원");
  assert.deepEqual(parseCardList(lines, { ...SHOT, inheritedDate: "2026-10-02" }).map((d) => [d.date, d.dateSource]), [["2026-10-02", "inherited"]]);
  assert.deepEqual(parseCardList(lines, SHOT).map((d) => [d.date, d.dateSource]), [[null, null]]);
});

test("카드 결제예정금액: 같은 행의 금액을 카드 대금 초안(total)으로, 거래 행으로 중복 집계하지 않는다", () => {
  const lines = [line("가상카드", 30, 80, 200, 110), line("결제예정금액", 30, 200, 200, 230), line("1,234,000원", 380, 200, 540, 230)];
  const drafts = parseCardList(lines, SHOT);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]!.role, "total");
  assert.equal(drafts[0]!.name, "가상카드");
  assert.equal(drafts[0]!.amount?.value, 1234000);
});

test("영수증: 상호 = 위 25% 안 가장 큰 한글, 일시 = 첫 날짜, 합계 = 받을금액(부가세 줄 제외), 품목 합 비교", () => {
  const [d] = parseReceipt(RECEIPT_CAPTURE(), PHOTO);
  assert.equal(d!.name, "가상식당");
  assert.equal(d!.amount?.value, 18000);
  assert.equal(d!.date, "2026-10-05");
  assert.equal(d!.time, "12:30");
  assert.equal(d!.role, "total");
  assert.deepEqual(d!.extraReasons, []);
  const [mismatch] = parseReceipt(RECEIPT_CAPTURE("2,000"), PHOTO);
  assert.deepEqual(mismatch!.extraReasons, ["sum-mismatch"]);
});

test("영수증: 합계 낱말이 없으면 가장 큰 금액", () => {
  const [d] = parseReceipt([line("가상분식", 200, 30, 400, 70), line("떡볶이 4,000", 50, 200, 550, 220), line("순대 3,000", 50, 240, 550, 260), line("7,000", 450, 300, 550, 320)], PHOTO);
  assert.equal(d!.amount?.value, 7000);
});

test("관리비 고지서: 머리글(항목·당월) 열로 배정, 3도 기울어도 같은 결과, 합계에 납부기한, 품목 합 = 합계", () => {
  for (const angle of [0, (3 * Math.PI) / 180, (-2 * Math.PI) / 180]) {
    const drafts = parseBillTable(BILL_CAPTURE(angle), PHOTO);
    assert.deepEqual(
      drafts.map((d) => [d.role, d.name, d.amount?.value, d.date]),
      [
        ["item", "일반관리비", 52000, null],
        ["item", "전기료", 28000, null],
        ["item", "수도료", 12000, null],
        ["total", "합계", 92000, "2026-10-25"],
      ],
      `angle ${angle}`,
    );
    assert.deepEqual(drafts[3]!.extraReasons, []);
  }
});

test("손글씨: 첫 줄 N월 = 월 맥락, 행 = 맨 앞 일, 금액 = 괄호 밖 가장 오른쪽 숫자, 다음 줄 괄호는 윗 행 이름에, 대출 잔액은 따로", () => {
  const drafts = parseHandwriting(MEMO_CAPTURE, PHOTO);
  assert.deepEqual(
    drafts.map((d) => [d.name, d.amount?.value, d.date, d.dateSource]),
    [
      ["가상헬스 (월 회원권)", 50000, "2026-10-05", "context"],
      ["가상대출 이자 (3000만원)", 120000, "2026-10-12", "context"],
      ["관리비", 150000, "2026-10-25", "context"],
      ["가상보험", 45000, "2026-10-31", "context"],
      ["가상대출 잔액", 30_000_000, "2026-10-12", "context"],
    ],
  );
  assert.equal(drafts[4]!.hint, "loan-balance");
  assert.doesNotMatch(drafts[1]!.context, /3000만원/, "이자 행은 잔액 표기 없이 분류");
});

test("손글씨: 월 맥락이 캡처일보다 뒤면 전년, 그 달 말일을 넘는 일은 범위 밖, 32 는 행이 아니다", () => {
  const drafts = parseHandwriting([line("11월", 40, 30, 120, 70), line("31 가상학원 200,000", 40, 100, 400, 140), line("32 가상 1,000", 40, 160, 400, 200)], PHOTO);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]!.date, null);
  assert.equal(drafts[0]!.dayOutOfRange, true);
  const nov = parseHandwriting([line("11월", 40, 30, 120, 70), line("3 가상학원 200,000", 40, 100, 400, 140)], PHOTO);
  assert.equal(nov[0]!.date, "2025-11-03");
});

test("레이아웃 추정: 고지서 → 영수증 → 오른쪽 금액원 → 손글씨", () => {
  assert.equal(detectLayout(CARD_CAPTURE, SHOT), "card");
  assert.equal(detectLayout(RECEIPT_CAPTURE(), PHOTO), "receipt");
  assert.equal(detectLayout(BILL_CAPTURE(), PHOTO), "bill");
  assert.equal(detectLayout(MEMO_CAPTURE, PHOTO), "handwriting");
});
