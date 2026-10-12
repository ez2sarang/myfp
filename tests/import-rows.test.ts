// 확인 화면 행: 기본 선택(신뢰도 '높음'만), 일괄 선택 제외('낮음'·제외), 노랑 강조, 행 → 등록 요청 JSON 이 서버 검증을 통과.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCandidates } from "../src/lib/import/classify.ts";
import { parseImportPayload } from "../src/lib/import/register.ts";
import {
  HANDWRITING_NOTICE,
  REASON_LABELS,
  TOTAL_MISMATCH_NOTICE,
  canBulkSelect,
  categoriesFor,
  categoryLabel,
  defaultRow,
  highlights,
  photoNotices,
  toPayload,
  type RowState,
} from "../src/lib/import/rows.ts";
import { IMPORT_FIELDS, type ImportTarget, type Layout } from "../src/lib/import/types.ts";
import { CARD_CAPTURE, MEMO_CAPTURE, PHOTO, RECEIPT_CAPTURE, SHOT, TODAY } from "./import-fixtures.ts";

const card = buildCandidates([{ lines: CARD_CAPTURE, ctx: SHOT }]);
const cardRows = card.map((c, i) => defaultRow(c, `0:${i}`));

test("기본 행: 제안 분류를 대상으로, 취소·현금서비스는 제외, 기본 선택은 신뢰도 '높음'만", () => {
  assert.deepEqual(
    cardRows.map((r) => [r.name, r.target, r.category, r.selected]),
    [
      ["가상커피 본점", "planned", "other", true],
      ["가상마트", "planned", "other", false],
      ["가상통신", "fixed", "telecom", true],
      ["가상가전", "planned", "other", true],
      ["가상커피 본점", "skip", "", false],
      ["현금서비스", "skip", "", false],
      ["가상서점", "planned", "other", false],
    ],
  );
  assert.equal(cardRows[3]!.count, "4", "할부 3/6회 → 남은 4회");
  assert.equal(cardRows[2]!.paymentMethod, "card");
  assert.equal(cardRows[2]!.date, "2026-10-03");
});

test("손글씨는 '낮음'이라 기본 해제·일괄 선택 제외, 이름은 회색 제안만", () => {
  const memo = buildCandidates([{ lines: MEMO_CAPTURE, ctx: PHOTO }]);
  const rows = memo.map((c, i) => defaultRow(c, `0:${i}`));
  assert.ok(rows.every((r) => !r.selected && r.name === "" && r.nameHint.length > 0));
  assert.ok(memo.every((c, i) => !canBulkSelect(c, rows[i]!)));
  assert.ok(memo.every((c) => highlights(c).name && highlights(c).amount));
  // 카드 목록: '확인 필요'는 일괄 선택 대상, 제외 행은 아님
  assert.deepEqual(card.map((c, i) => canBulkSelect(c, cardRows[i]!)), [true, true, true, true, false, false, true]);
});

test("노랑 강조: 날짜 이어받음 → 날짜, 보정 → 금액, 사진 → 금액", () => {
  assert.deepEqual(highlights(card[1]!), { amount: false, date: true, name: false });
  assert.deepEqual(highlights(card[6]!), { amount: true, date: false, name: false });
  assert.deepEqual(highlights(card[0]!), { amount: false, date: false, name: false });
  const receipt = buildCandidates([{ lines: RECEIPT_CAPTURE(), ctx: PHOTO }]);
  assert.equal(highlights(receipt[0]!).amount, true);
});

test("손글씨 확인 신호의 노랑 강조와 사유: 일 순서 어긋남 → 날짜 칸, 합계 불일치 → 금액 칸", () => {
  const base = card[0]!;
  assert.deepEqual(highlights({ ...base, reasons: ["day-order"] }), { amount: false, date: true, name: false });
  assert.deepEqual(highlights({ ...base, reasons: ["total-mismatch"] }), { amount: true, date: false, name: false });
  assert.equal(REASON_LABELS["day-order"], "일이 위 행보다 앞서요");
  assert.equal(REASON_LABELS["total-mismatch"], "합계와 불일치");
});

test("사진 위 주의 줄: 손글씨(자동 판정·사용자 선택 모두 layout 으로 들어옴)에만 인식 주의, 합계 불일치가 있으면 경고 한 줄 더", () => {
  assert.equal(HANDWRITING_NOTICE, "손글씨는 인식이 부정확할 수 있어요. 금액과 날짜를 꼭 확인해 주세요.");
  assert.equal(TOTAL_MISMATCH_NOTICE, "적어 둔 합계와 읽은 금액의 합이 달라요. 금액을 확인해 주세요.");
  const memo = buildCandidates([{ lines: MEMO_CAPTURE, ctx: PHOTO }]);
  for (const layout of ["card", "receipt", "bill"] as Layout[]) assert.deepEqual(photoNotices(layout, card), [], layout);
  assert.deepEqual(photoNotices("handwriting", memo), [HANDWRITING_NOTICE]);
  const wrong = memo.map((c) => ({ ...c, reasons: [...c.reasons, "total-mismatch" as const] }));
  assert.deepEqual(photoNotices("handwriting", wrong), [HANDWRITING_NOTICE, TOTAL_MISMATCH_NOTICE]);
});

test("행 → 등록 요청: 선택한 행만, 대상별 허용 필드만, 서버 검증 통과", () => {
  const rows: RowState[] = cardRows.map((r) => ({ ...r }));
  rows[1]!.selected = true;
  rows[6]!.target = "asset";
  rows[6]!.category = "deposit";
  rows[6]!.selected = true;
  rows[6]!.amount = "10,500원";
  const out = toPayload(rows, { private: false, confirmDuplicates: false });
  assert.ok(out.ok);
  assert.deepEqual(out.keys, ["0:0", "0:1", "0:2", "0:3", "0:6"]);
  const body = JSON.parse(out.payload) as { items: Record<string, unknown>[] };
  for (const item of body.items) assert.deepEqual(Object.keys(item).sort(), [...IMPORT_FIELDS[item.target as ImportTarget]].sort());
  assert.deepEqual(body.items[2], { target: "fixed", name: "가상통신", amount: 55000, category: "telecom", billingDay: 3, paymentMethod: "card" });
  assert.deepEqual(body.items[4], { target: "asset", name: "가상서점", amount: 10500, category: "deposit", asOf: "2026-10-03" });
  const parsed = parseImportPayload(out.payload, TODAY);
  assert.ok(parsed.ok, JSON.stringify(parsed));
});

test("행 → 등록 요청 거부: 고른 행 없음·금액 비숫자·이름 없음·예정일 없음·100건 초과", () => {
  assert.equal(toPayload(cardRows.map((r) => ({ ...r, selected: false })), { private: false, confirmDuplicates: false }).ok, false);
  const one = (patch: Partial<RowState>) => toPayload([{ ...cardRows[0]!, ...patch }], { private: false, confirmDuplicates: false });
  assert.deepEqual(one({ amount: "12.5" }), { ok: false, key: "0:0", message: "금액을 숫자로 입력해 주세요." });
  assert.deepEqual(one({ name: "  " }), { ok: false, key: "0:0", message: "이름을 입력해 주세요." });
  assert.deepEqual(one({ date: "" }), { ok: false, key: "0:0", message: "예정일을 입력해 주세요." });
  const many = Array.from({ length: 101 }, (_, i) => ({ ...cardRows[0]!, key: `0:${i}` }));
  assert.equal(toPayload(many, { private: false, confirmDuplicates: false }).ok, false);
});

test("분류 이름은 대상별 표에서: 지출 '기타'와 부채 '기타 부채'가 서로 덮어쓰지 않는다", () => {
  assert.equal(categoryLabel("fixed", "other"), "기타");
  assert.equal(categoryLabel("planned", "other"), "기타");
  assert.equal(categoryLabel("liability", "other"), "기타 부채");
  assert.equal(categoryLabel("asset", "other"), "기타 자산");
  assert.equal(categoryLabel("liability", "card"), "카드");
  assert.equal(categoryLabel("liability", "loan"), "대출");
  assert.equal(categoryLabel("fixed", "loan"), "대출 상환");
  assert.equal(categoryLabel("asset", "deposit"), "예금·적금");
  // 대상별 분류 목록의 모든 값에 그 대상의 이름이 있다(분류 값 그대로 보이는 일 없음)
  for (const target of ["fixed", "planned", "asset", "liability"] as const) {
    for (const cat of categoriesFor(target)) assert.notEqual(categoryLabel(target, cat), cat, `${target}:${cat}`);
  }
});
