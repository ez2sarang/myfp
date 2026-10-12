// 확인 화면 행: 기본 선택(신뢰도 '높음'만), 일괄 선택 제외('낮음'·제외), 노랑 강조, 행 → 등록 요청 JSON 이 서버 검증을 통과.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCandidates } from "../src/lib/import/classify.ts";
import { parseImportPayload } from "../src/lib/import/register.ts";
import { canBulkSelect, defaultRow, highlights, toPayload, type RowState } from "../src/lib/import/rows.ts";
import { IMPORT_FIELDS, type ImportTarget } from "../src/lib/import/types.ts";
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
