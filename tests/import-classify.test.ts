// 등록 후보: 분류 제안(사용자 기준과 충돌 없음), 취소 상계, 중복 의심, 규칙 기반 신뢰도. 합성 캡처·가상 이름·가상 금액만 쓴다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCandidates, classify, confidenceOf, similarity } from "../src/lib/import/classify.ts";
import type { Draft } from "../src/lib/import/parse.ts";
import { BILL_CAPTURE, CARD_CAPTURE, line, MEMO_CAPTURE, PHOTO, RECEIPT_CAPTURE, row, SHOT } from "./import-fixtures.ts";

function draft(partial: Partial<Draft> & Pick<Draft, "name">): Draft {
  return {
    layout: "card",
    role: "item",
    amount: { value: 10000, negative: false, corrected: false, valid: true, hasWon: true },
    date: "2026-10-03",
    time: null,
    dateSource: "direct",
    dayOutOfRange: false,
    installment: null,
    cancelled: false,
    context: partial.name,
    extraReasons: [],
    lines: [0],
    box: null,
    ...partial,
  };
}

test("분류 제안 표: 신호 → 제안 (할부·단기카드대출은 고정지출이 아니다)", () => {
  const cases: [Partial<Draft> & Pick<Draft, "name">, unknown][] = [
    [{ name: "가상생명 보험료" }, { kind: "fixed", category: "insurance" }],
    [{ name: "가상은행 대출이자" }, { kind: "fixed", category: "loan_interest" }],
    [{ name: "가상은행 원리금 상환" }, { kind: "fixed", category: "loan" }],
    [{ name: "가상통신 휴대폰 요금" }, { kind: "fixed", category: "telecom" }],
    [{ name: "가상영상 월 구독" }, { kind: "fixed", category: "subscription" }],
    [{ name: "아파트 관리비" }, { kind: "fixed", category: "housing" }],
    [{ name: "전기요금" }, { kind: "fixed", category: "utilities" }],
    [{ name: "가상가전", installment: { current: 3, total: 6 } }, { kind: "planned" }],
    [{ name: "가상생명 보험료", installment: { current: null, total: null } }, { kind: "planned" }],
    [{ name: "현금서비스" }, { kind: "none", why: "short-term-card-loan" }],
    [{ name: "단기카드대출 이자" }, { kind: "none", why: "short-term-card-loan" }],
    [{ name: "가상카드", role: "total", context: "결제예정금액 가상카드" }, { kind: "liability", category: "card" }],
    [{ name: "전기료", layout: "bill", role: "item" }, { kind: "none", why: "bill-item" }],
    [{ name: "가상은행 주택담보대출 잔액" }, { kind: "liability", category: "loan" }],
    [{ name: "가상대출 잔액", layout: "handwriting", hint: "loan-balance" }, { kind: "liability", category: "loan" }],
    [{ name: "가상은행 대출 이자" }, { kind: "fixed", category: "loan_interest" }],
    [{ name: "가상저축은행 대출이자" }, { kind: "fixed", category: "loan_interest" }],
    [{ name: "가상증권 주식 평가금액" }, { kind: "asset", category: "investment" }],
    [{ name: "가상은행 자유적금" }, { kind: "asset", category: "deposit" }],
    [{ name: "가상카페" }, { kind: "planned" }],
    [{ name: "가상생명 보험료", cancelled: true }, { kind: "offset", offsetOf: null }],
  ];
  for (const [partial, expected] of cases) assert.deepEqual(classify(draft(partial)), expected, partial.name);
});

test("이름 유사도: 공백 무시, 한 글자 다른 7자 이름은 0.85 미만", () => {
  assert.equal(similarity("가상커피 본점", "가상커피본점"), 1);
  assert.ok(similarity("가상커피 본점", "가상커피 분점") < 0.85);
  assert.ok(similarity("가상커피 본점 가상동", "가상커피 본점 가상등") >= 0.85);
  assert.equal(similarity("", ""), 1);
});

test("신뢰도는 규칙으로: 낮음 > 확인 필요 > 높음", () => {
  assert.equal(confidenceOf([]), "high");
  assert.equal(confidenceOf(["photo"]), "check");
  assert.equal(confidenceOf(["corrected", "date-inherited"]), "check");
  assert.equal(confidenceOf(["photo", "handwriting"]), "low");
  assert.equal(confidenceOf(["format"]), "low");
  assert.equal(confidenceOf(["no-amount"]), "low");
  assert.equal(confidenceOf(["day-range"]), "low");
});

test("카드 캡처 → 후보: 분류·취소 상계·신뢰도·보정 표시", () => {
  const out = buildCandidates([{ lines: CARD_CAPTURE, ctx: SHOT }]);
  assert.deepEqual(
    out.map((c) => [c.name, c.amount, c.suggestion, c.confidence, c.reasons]),
    [
      ["가상커피 본점", 4500, { kind: "planned" }, "high", []],
      ["가상마트", 32000, { kind: "planned" }, "check", ["date-inherited"]],
      ["가상통신", 55000, { kind: "fixed", category: "telecom" }, "high", []],
      ["가상가전", 120000, { kind: "planned" }, "high", []],
      ["가상커피 본점", 4500, { kind: "offset", offsetOf: 0 }, "high", []],
      ["현금서비스", 300000, { kind: "none", why: "short-term-card-loan" }, "high", []],
      ["가상서점", 10500, { kind: "planned" }, "check", ["corrected"]],
    ],
  );
  assert.equal(out[6]!.corrected, true);
  assert.deepEqual(out[3]!.installment, { current: 3, total: 6 });
  assert.equal(out[4]!.cancelled, true);
  assert.equal(out[4]!.duplicateOf, null, "취소는 중복이 아니라 상계");
  assert.ok(out.every((c, i) => c.index === i && c.capture === 0));
});

test("겹친 두 캡처: 같은 (금액, 날짜·시각) 또는 같은 금액·같은 날·이름 유사도 0.85 이상이면 앞 후보의 중복 의심(확인 필요)", () => {
  const second = [
    ...row(100, "가상커피 본점", "4,500원"), // 첫 캡처 0번과 같은 거래(날짜·시각 같음)
    line("2026.10.03 08:15", 30, 135, 220, 155),
    ...row(200, "가상커피 몬점", "4,500원"), // 이름 오인식이어도 금액·날짜·시각이 같으면 중복
    line("2026.10.03 08:15", 30, 235, 220, 255),
    ...row(300, "가상커피 본점", "4,500원"), // 같은 가게·같은 금액이지만 다른 시각 → 중복 아님
    line("2026.10.03 15:40", 30, 335, 220, 355),
  ];
  const out = buildCandidates([
    { lines: CARD_CAPTURE, ctx: SHOT },
    { lines: second, ctx: SHOT },
  ]);
  const fromSecond = out.filter((c) => c.capture === 1);
  assert.deepEqual(fromSecond.map((c) => c.duplicateOf), [0, 0, null]);
  assert.equal(fromSecond[0]!.confidence, "check");
  assert.ok(fromSecond[0]!.reasons.includes("duplicate"));
  // 시각이 없으면 같은 날·이름 유사도로 판정
  const noTime = buildCandidates([
    { lines: row(100, "가상마트 가상점", "32,000원"), ctx: { ...SHOT, inheritedDate: "2026-10-03" } },
    { lines: [...row(100, "가상마트 가상점", "32,000원"), ...row(200, "다른가게", "32,000원")], ctx: { ...SHOT, inheritedDate: "2026-10-03" } },
  ]);
  assert.deepEqual(noTime.map((c) => c.duplicateOf), [null, 0, null]);
});

test("영수증·고지서·손글씨 → 후보: 사진은 확인 필요, 손글씨는 낮음, 고지서 품목은 합계에 포함", () => {
  const out = buildCandidates([
    { lines: RECEIPT_CAPTURE(), ctx: PHOTO },
    { lines: BILL_CAPTURE(), ctx: PHOTO },
    { lines: MEMO_CAPTURE, ctx: PHOTO },
  ]);
  const receipt = out.filter((c) => c.capture === 0);
  assert.deepEqual(receipt.map((c) => [c.layout, c.name, c.amount, c.suggestion, c.confidence, c.reasons]), [["receipt", "가상식당", 18000, { kind: "planned" }, "check", ["photo"]]]);
  const bill = out.filter((c) => c.capture === 1);
  assert.deepEqual(
    bill.map((c) => [c.role, c.amount, c.suggestion]),
    [
      ["item", 52000, { kind: "none", why: "bill-item" }],
      ["item", 28000, { kind: "none", why: "bill-item" }],
      ["item", 12000, { kind: "none", why: "bill-item" }],
      ["total", 92000, { kind: "fixed", category: "housing" }],
    ],
  );
  assert.deepEqual(bill[3]!.reasons, ["photo"]);
  const memo = out.filter((c) => c.capture === 2);
  assert.deepEqual(
    memo.map((c) => [c.name, c.suggestion]),
    [
      ["가상헬스 (월 회원권)", { kind: "planned" }],
      ["가상대출 이자 (3000만원)", { kind: "fixed", category: "loan_interest" }],
      ["관리비", { kind: "fixed", category: "housing" }],
      ["가상보험", { kind: "fixed", category: "insurance" }],
      ["가상대출 잔액", { kind: "liability", category: "loan" }],
    ],
  );
  assert.ok(memo.every((c) => c.confidence === "low" && c.reasons.includes("handwriting") && c.reasons.includes("date-inherited")));
});

test("금액 없음·형식 위반·말일 초과는 낮음", () => {
  const out = buildCandidates([
    { lines: [line("11월", 40, 30, 120, 70), line("31 가상학원", 40, 100, 400, 140), line("3 가상서점 12000", 40, 160, 400, 200)], ctx: PHOTO },
  ]);
  assert.deepEqual(out.map((c) => [c.amount, c.reasons.filter((r) => r !== "photo" && r !== "handwriting")]), [
    [null, ["no-amount", "day-range"]],
    // 31 다음 3 은 인접 행 쌍 기준으로 일 순서 어긋남(31 이 말일 초과여도 행이다)
    [12000, ["format", "date-inherited", "day-order"]],
  ]);
  assert.ok(out.every((c) => c.confidence === "low"));
});

test("손글씨 확인 신호: 일 순서 어긋남·합계 불일치는 사유로 붙고(교정 없음) 신뢰도는 그대로 낮음", () => {
  const out = buildCandidates([
    {
      lines: [line("10월", 40, 30, 120, 70), line("12 가상서점 2,000", 40, 100, 400, 140), line("5 가상카페 3,000", 40, 160, 400, 200), line("합계 9,000", 40, 220, 400, 260)],
      ctx: PHOTO,
    },
  ]);
  assert.deepEqual(
    out.map((c) => [c.name, c.amount, c.date, c.reasons.filter((r) => r === "day-order" || r === "total-mismatch"), c.confidence]),
    [
      ["가상서점", 2000, "2026-10-12", ["total-mismatch"], "low"],
      ["가상카페", 3000, "2026-10-05", ["day-order", "total-mismatch"], "low"],
    ],
  );
});
