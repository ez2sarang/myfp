// CSV 내보내기(수식 주입 방지)와 개인 데이터 시드 정규화 시험. 시드 값은 모두 가짜다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, toCsv } from "../src/lib/finance/csv.ts";
import { normalizeSeed } from "../src/lib/finance/import.ts";

test("CSV: BOM, 따옴표·쉼표·줄바꿈 인용, 수식 시작 문자는 ' 로 무력화", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell(-5), "-5", "숫자는 그대로");
  assert.equal(csvCell(null), "");
  const csv = toCsv(["이름", "금액"], [["월세", 100]]);
  assert.ok(csv.startsWith("﻿이름,금액\r\n월세,100"));
});

const seed = {
  version: 1,
  as_of: "2026-10-12",
  owner_email_from_env: "ADMIN_EMAILS",
  currency: "KRW",
  fixed_expenses: [
    { key: "demo-loan", name: "데모 대출", category: "loan", amount: 100000, billing_day: 15, payment_method: "bank_autopay", institution: "데모은행", remaining_count: 9, end_date: null, note: "가짜", source: "user" },
    { key: "demo-insurance", name: "데모 보험", category: "insurance", amount: 50000, billing_day: null, payment_method: null, institution: "데모생명", remaining_count: null, end_date: null, note: "", source: "user" },
  ],
  assets: [{ key: "demo-cash", name: "현금", category: "cash", amount: 1000 }],
  liabilities: [{ key: "demo-card", name: "카드", category: "card", amount: 2000, monthly_payment: 100 }],
};

test("시드: 소유자는 ADMIN_EMAILS 첫 항목, 남은 횟수는 as_of 기준 종료일로 정규화, 납부일 미정 허용", () => {
  const r = normalizeSeed(seed, " Owner@Example.com , second@example.com");
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  assert.equal(r.value.ownerEmail, "owner@example.com");
  assert.equal(r.value.fixed.length, 2);
  assert.equal(r.value.fixed[0]!.externalKey, "demo-loan");
  assert.equal(r.value.fixed[0]!.input.endDate, "2027-06-15");
  assert.equal(r.value.fixed[0]!.input.active, true);
  assert.equal(r.value.fixed[1]!.input.billingDay, null);
  assert.equal(r.value.fixed[1]!.input.paymentMethod, null);
  assert.deepEqual(r.value.balances.map((b) => [b.externalKey, b.input.kind]), [["demo-cash", "asset"], ["demo-card", "liability"]]);
});

test("시드 오류: 소유자 없음·잘못된 값·중복 키를 모으고, 메시지에 금액·이름 값을 넣지 않는다", () => {
  assert.ok(!normalizeSeed(seed, undefined).ok);
  const bad = normalizeSeed(
    {
      ...seed,
      fixed_expenses: [
        { ...seed.fixed_expenses[0], amount: -987654 },
        { ...seed.fixed_expenses[0] },
        { ...seed.fixed_expenses[0], key: "Bad Key" },
      ],
    },
    "owner@example.com",
  );
  assert.ok(!bad.ok);
  const text = bad.errors.join("\n");
  assert.match(text, /amount/);
  assert.match(text, /중복/);
  assert.equal(text.includes("987654"), false);
  assert.equal(text.includes("데모 대출"), false);
});
