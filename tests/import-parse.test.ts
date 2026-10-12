// 인식 줄 → 항목 초안 파서 4종(카드 앱 목록·영수증·관리비 고지서 표·손글씨 메모)과 레이아웃 추정. 합성 상자·가상 이름·가상 금액만 쓴다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLayout, groupRows, layoutItems, parseBillTable, parseCardList, parseHandwriting, parseReceipt, type Draft } from "../src/lib/import/parse.ts";
import type { Reason } from "../src/lib/import/types.ts";
import { BILL_CAPTURE, CARD_CAPTURE, line, MART, MART_RECEIPT, MEMO_CAPTURE, PHOTO, RECEIPT_CAPTURE, row, SHOT } from "./import-fixtures.ts";

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
  // 품목 합 검사는 품목 표 머리글이 있을 때만(한 줄 품목도 머리글이 있으면 검사한다)
  assert.deepEqual(parseReceipt(RECEIPT_CAPTURE("1,000", { header: true }), PHOTO)[0]!.extraReasons, []);
  assert.deepEqual(parseReceipt(RECEIPT_CAPTURE("2,000", { header: true }), PHOTO)[0]!.extraReasons, ["sum-mismatch"]);
  assert.deepEqual(parseReceipt(RECEIPT_CAPTURE("2,000"), PHOTO)[0]!.extraReasons, [], "머리글이 없으면 합이 달라도 검사하지 않는다");
});

test("마트 영수증(두 줄 품목): 합계 = 총구매액(포인트·부가세·단가 아님), 품목 합은 머리글 아래 오른쪽 열만 더해 주소·안내문·무게 숫자가 섞이지 않는다", () => {
  const [d] = parseReceipt(MART_RECEIPT(), MART);
  assert.deepEqual([d!.name, d!.date, d!.time, d!.amount?.value, d!.extraReasons], ["가상마트", "2026-10-05", "14:20", 16_500, []]);
  assert.equal(detectLayout(MART_RECEIPT(), MART), "receipt");
  assert.deepEqual(parseReceipt(MART_RECEIPT({ amounts: ["4,000", "7,500", "2,500", "3,000"] }), MART)[0]!.extraReasons, ["sum-mismatch"], "품목 하나가 다르면");
  const noHead = parseReceipt(MART_RECEIPT({ amounts: ["4,000", "7,500", "2,500", "3,000"], header: false }), MART)[0]!;
  assert.deepEqual([noHead.amount?.value, noHead.extraReasons], [16_500, []], "머리글이 없으면 합이 달라도 경고 없음");
});

test("영수증 합계 낱말: 내실금액 > 총구매액 > … > 매출금액 > 신용액(「신용」「액:」 쪼개짐 허용), 포인트 줄은 합계가 아니고, 낱말이 없으면 세금·포인트를 뺀 최댓값", () => {
  const only = (totals: [string, string][], sales = false) => parseReceipt(MART_RECEIPT({ totals, sales }), MART)[0]!;
  assert.equal(only([["신용액", "16,500"]]).amount?.value, 16_500, "신용 + 액: 두 상자");
  assert.equal(only([], true).amount?.value, 16_500, "매출금액");
  const both = only([
    ["총구매액", "17,000"],
    ["내실금액", "16,500"],
  ]);
  assert.deepEqual([both.amount?.value, both.extraReasons], [16_500, []], "내실금액이 총구매액보다 먼저");
  // 낱말이 하나도 없으면 최댓값(포인트 98,700·과세물품가액 줄 제외), 이때는 품목 합 검사를 하지 않는다
  const fallback = only([]);
  assert.deepEqual([fallback.amount?.value, fallback.extraReasons], [7_000, []]);
  assert.notEqual(parseReceipt(MART_RECEIPT(), MART)[0]!.amount?.value, 98_700);
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

// 손글씨 메모 한 줄씩(60px 간격). 괄호 보충줄은 조금 들여 쓴다
const memo = (...texts: string[]) => parseHandwriting(texts.map((t, k) => line(t, t.startsWith("(") ? 80 : 40, 30 + 60 * k, 400, 70 + 60 * k)), PHOTO);
const flagged = (drafts: Draft[], reason: Reason) => drafts.map((d) => [d.name, d.extraReasons.includes(reason)]);

test("손글씨 일 순서: 바로 위 행보다 일이 작은 행만 표시(교정 없음), 같은 일 반복·월 제목·괄호 보충줄·합계 줄은 영향 없음", () => {
  assert.ok(memo("10월", "1 가상가게 1,000", "5 가상가게 2,000", "5 가상카페 3,000", "20 가상서점 4,000").every((d) => !d.extraReasons.includes("day-order")), "오름차순·같은 일 반복");
  const off = memo("10월", "3 가상가 1,000", "12 가상나 2,000", "5 가상다 3,000", "8 가상라 4,000");
  assert.deepEqual(flagged(off, "day-order"), [
    ["가상가", false],
    ["가상나", false],
    ["가상다", true],
    ["가상라", false],
  ]);
  assert.deepEqual(
    off.map((d) => d.date),
    ["2026-10-03", "2026-10-12", "2026-10-05", "2026-10-08"],
    "일은 고치지 않는다",
  );
  // 첫 행은 비교 대상이 없다(월 제목 12월 은 행이 아니다)
  assert.deepEqual(flagged(memo("28 가상가 1,000", "3 가상나 2,000"), "day-order"), [
    ["가상가", false],
    ["가상나", true],
  ]);
  assert.ok(memo("12월", "3 가상가 1,000", "4 가상나 2,000").every((d) => !d.extraReasons.includes("day-order")));
  const parens = memo("10월", "5 가상가 1,000", "(1일 자동이체)", "12 가상나 2,000", "합계 3,000", "20 가상다 4,000");
  assert.deepEqual(flagged(parens, "day-order"), [
    ["가상가 (1일 자동이체)", false],
    ["가상나", false],
    ["가상다", false],
  ]);
});

test("손글씨 일 순서: 말일 초과 행은 기준에서 빼고 직전의 유효한 일 행과 비교(연쇄 없음), 월 제목이 없으면 31 까지 유효", () => {
  // 11월 31 은 말일 초과: 그 행은 day-order 없이 기존 표시(범위 밖)만, 다음 행은 그 위 유효 행(5·10)과 비교
  const back = memo("11월", "5 가상가 1,000", "31 가상나 2,000", "3 가상다 3,000");
  assert.deepEqual(flagged(back, "day-order"), [
    ["가상가", false],
    ["가상나", false],
    ["가상다", true],
  ]);
  assert.equal(back[1]!.dayOutOfRange, true);
  assert.ok(memo("11월", "5 가상가 1,000", "31 가상나 2,000", "8 가상다 3,000").every((d) => !d.extraReasons.includes("day-order")), "유효 행 기준으로 정상");
  assert.ok(memo("11월", "10 가상가 1,000", "31 가상나 2,000", "12 가상다 3,000", "13 가상라 4,000").every((d) => !d.extraReasons.includes("day-order")), "연쇄 없음");
  // 월 제목이 없으면 말일을 모르므로 31 까지 유효(캡처일이 30일까지인 달이어도): 10 은 5 가 아니라 31 과 비교된다
  const noMonth = parseHandwriting([line("5 가상가 1,000", 40, 30, 400, 70), line("31 가상나 2,000", 40, 90, 400, 130), line("10 가상다 3,000", 40, 150, 400, 190)], { ...PHOTO, today: "2026-11-20" });
  assert.deepEqual(flagged(noMonth, "day-order"), [
    ["가상가", false],
    ["가상나", false],
    ["가상다", true],
  ]);
});

test("손글씨 합계: 합계 줄 위 행 금액 합 ≠ 합계면 그 행 모두에 표시, 같거나 합계 줄이 없거나 행 금액이 1개면 검사 안 함, 합계 줄은 항목이 아니다", () => {
  assert.ok(parseHandwriting(MEMO_CAPTURE, PHOTO).every((d) => !d.extraReasons.includes("total-mismatch")), "일치(대출 잔액은 합에 넣지 않음)");
  const wrong = memo("10월", "5 가상헬스 50,000", "12 가상대출 이자 120,000 (3000만원)", "20 가상가 7,000", "합계 999,000");
  assert.deepEqual(flagged(wrong, "total-mismatch"), [
    ["가상헬스", true],
    ["가상대출 이자 (3000만원)", true],
    ["가상가", true],
    ["가상대출 잔액", false],
  ]);
  assert.ok(!wrong.some((d) => /합계/.test(d.name) || d.amount?.value === 999_000), "합계 줄은 후보가 아니다");
  assert.ok(memo("10월", "5 가상가 1,000", "12 가상나 2,000").every((d) => d.extraReasons.length === 0), "합계 줄 없음");
  assert.ok(memo("10월", "5 가상가 1,000", "합계 9,000").every((d) => d.extraReasons.length === 0), "행 금액 1개");
  assert.ok(memo("10월", "5 가상가 1,000", "12 가상나", "합계 9,000").every((d) => !d.extraReasons.includes("total-mismatch")), "금액 있는 행 1개");
  for (const total of ["총 9,000", "계: 9,000", "합 9,000원", "총합계 9,000", "합계 9,000 (2건)"]) {
    assert.ok(memo("10월", "5 가상가 1,000", "12 가상나 2,000", total).every((d) => d.extraReasons.includes("total-mismatch")), total);
    assert.equal(memo("10월", "5 가상가 1,000", "12 가상나 2,000", total.replace("9,000", "3,000")).some((d) => d.extraReasons.includes("total-mismatch")), false, total);
  }
  // 합계 줄 아래 행은 더하지도 표시하지도 않는다(영수증과 같은 구조)
  assert.ok(memo("10월", "5 가상가 1,000", "12 가상나 2,000", "합계 3,000", "20 가상다 4,000").every((d) => d.extraReasons.length === 0), "합계 아래 행");
  assert.deepEqual(flagged(memo("10월", "5 가상가 1,000", "12 가상나 2,000", "합계 9,000", "20 가상다 4,000"), "total-mismatch"), [
    ["가상가", true],
    ["가상나", true],
    ["가상다", false],
  ]);
  // 합계 낱말이 아닌 줄(계좌·합정)이나 금액 말고 다른 낱말이 있는 줄은 합계로 보지 않는다
  for (const text of ["계좌이체 9,000", "합정 9,000", "총 3건"]) {
    assert.ok(memo("10월", "5 가상가 1,000", "12 가상나 2,000", text).every((d) => d.extraReasons.length === 0), text);
  }
});

test("레이아웃 추정: 고지서 → 영수증 → 오른쪽 금액원 → 손글씨", () => {
  assert.equal(detectLayout(CARD_CAPTURE, SHOT), "card");
  assert.equal(detectLayout(RECEIPT_CAPTURE(), PHOTO), "receipt");
  assert.equal(detectLayout(BILL_CAPTURE(), PHOTO), "bill");
  assert.equal(detectLayout(MEMO_CAPTURE, PHOTO), "handwriting");
});

test("카드 앱 목록: 다음 행 이름 상자가 금액 상자보다 몇 px 위·행 간격 150px 안쪽·상자 높이가 달라도 신호가 앞 행으로 넘어오지 않는다", () => {
  // 이름 상자(높이 34)의 중심이 같은 행 금액 상자(높이 24)의 중심보다 3px 위
  const tallRow = (y: number, name: string, amount: string, date: string) => [
    line(name, 30, y - 8, 220, y + 26),
    line(amount, 400, y, 540, y + 24),
    line(date, 30, y + 34, 220, y + 52),
  ];
  const lines = [
    ...tallRow(100, "가상마트", "32,000원", "2026.10.03 12:40"),
    ...tallRow(210, "가상통신 요금", "55,000원", "2026.10.03 13:00"),
    ...tallRow(320, "가상가전 할부 2/3회", "120,000원", "2026.10.03 14:00"),
    ...tallRow(430, "가상서점 취소", "-9,000원", "2026.10.03 15:00"),
  ];
  const drafts = parseCardList(lines, SHOT);
  assert.deepEqual(
    drafts.map((d) => [d.name, d.installment !== null, d.cancelled, /통신/.test(d.context), /할부/.test(d.context), /취소/.test(d.context)]),
    [
      ["가상마트", false, false, false, false, false],
      ["가상통신 요금", false, false, true, false, false],
      ["가상가전 할부 2/3회", true, false, false, true, false],
      ["가상서점 취소", false, true, false, false, true],
    ],
  );
});

test("카드 결제예정금액: 아래 행이 이름 있는 거래 행이면 그 금액을 카드 대금으로 가져가지 않는다, 금액만 있는 바로 아래 행은 가져간다", () => {
  const withTransaction = [line("결제예정금액", 30, 100, 200, 130), ...row(150, "가상마트", "32,000원"), line("2026.10.03 12:40", 30, 185, 220, 205)];
  const drafts = parseCardList(withTransaction, SHOT);
  assert.deepEqual(drafts.map((d) => [d.role, d.name, d.amount?.value]), [["item", "가상마트", 32000]]);
  const amountBelow = [line("가상카드", 30, 40, 200, 70), line("결제예정금액", 30, 100, 200, 130), line("1,234,000원", 380, 150, 540, 180), ...row(260, "가상마트", "32,000원")];
  assert.deepEqual(parseCardList(amountBelow, SHOT).map((d) => [d.role, d.name, d.amount?.value]), [
    ["total", "가상카드", 1234000],
    ["item", "가상마트", 32000],
  ]);
});
