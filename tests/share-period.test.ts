// 공유 기간: 이번 달·특정 달·범위(최대 12개월). 기간 밖 달의 발생·합계·차트 점은 직렬화 결과에 없다. 저장된 기간도 읽을 때 다시 검사한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createShareLink } from "../src/lib/db/queries/share.ts";
import type { FixedOverride, PlannedExpense } from "../src/lib/finance/occurrences.ts";
import type { FixedExpense } from "../src/lib/finance/types.ts";
import { CURRENT_PERIOD, normalizePeriod, parseSharePeriod, periodMonths, type SharePeriod } from "../src/lib/share/options.ts";
import { generateShareToken } from "../src/lib/share/token.ts";
import { resolveShareView } from "../src/lib/share/resolve.ts";
import { buildShareView, type ShareSource } from "../src/lib/share/view.ts";
import { fakeDb } from "./fake-db.ts";

const NOW = new Date("2026-10-12T03:00:00Z"); // 서울 2026-10-12
const TODAY = "2026-10-12";
const ME = "aaaaaaaa-0000-4000-8000-000000000001";

function fx(over: Partial<FixedExpense>): FixedExpense {
  return {
    id: "f",
    name: "가상",
    category: "telecom",
    amount: 1_000,
    cycle: "monthly",
    billingDay: 10,
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

// 기간 밖에서만 나오는 구별 가능한 금액들
const OUT_FIXED = 3_131_313;
const OUT_OVERRIDE = 4_242_424;
const OUT_PLANNED = 5_353_535;
const OUT_YEARLY = 6_464_646;
const IN_PLANNED = 777_001;

const fixed: FixedExpense[] = [
  fx({ id: "a", name: "매달", amount: 10_000, billingDay: 31 }),
  fx({ id: "b", name: "나중 시작", amount: OUT_FIXED, startDate: "2027-03-01" }),
  fx({ id: "c", name: "끝난 것", amount: OUT_FIXED + 1, endDate: "2026-06-30" }),
  fx({ id: "d", name: "연 1회", cycle: "yearly", billingMonth: 6, billingDay: 30, amount: OUT_YEARLY }),
];
const overrides: FixedOverride[] = [
  { fixedExpenseId: "a", month: "2026-12", amount: 12_000, skipped: false },
  { fixedExpenseId: "a", month: "2027-05", amount: OUT_OVERRIDE, skipped: false },
];
const planned: PlannedExpense[] = [
  { id: "p1", dueDate: "2027-01-31", name: "기간 안 예정", category: "tax", amount: IN_PLANNED, status: "planned", note: null, groupId: null, seq: null, total: null },
  { id: "p2", dueDate: "2027-02-01", name: "기간 밖 예정", category: "tax", amount: OUT_PLANNED, status: "planned", note: null, groupId: null, seq: null, total: null },
];

function source(period: SharePeriod, over: Partial<ShareSource> = {}): ShareSource {
  return { scopes: ["summary", "fixed"], masks: { amounts: false, details: true }, createdAt: NOW, expiresAt: null, fixed, balances: [], period, overrides, planned, ...over };
}

const RANGE: SharePeriod = { mode: "range", start: "2026-11", end: "2027-01" };

test("범위: 기간 안의 달만 계산하고, 기간 밖 달의 금액·항목·차트 점이 결과에 없다", () => {
  const view = buildShareView(source(RANGE), NOW);
  const json = JSON.stringify(view);
  for (const n of [OUT_FIXED, OUT_FIXED + 1, OUT_OVERRIDE, OUT_PLANNED, OUT_YEARLY]) assert.equal(json.includes(String(n)), false, String(n));
  for (const name of ["나중 시작", "끝난 것", "연 1회", "기간 밖 예정"]) assert.equal(json.includes(name), false, name);
  assert.deepEqual(view.period.months, ["2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(view.summary?.months.map((m) => [m.month, m.total]), [
    ["2026-11", 10_000],
    ["2026-12", 12_000],
    ["2027-01", 10_000 + IN_PLANNED],
  ]);
  assert.equal(view.summary?.total, 32_000 + IN_PLANNED);
  assert.deepEqual(view.summary?.charts?.months?.rows.map((r) => r.month), ["2026-11", "2026-12", "2027-01"], "월별 막대는 기간 안의 달만");
  assert.ok(view.summary?.details.rows.every((r) => r.month >= "2026-11" && r.month <= "2027-01"));
  assert.equal(view.summary?.current, undefined, "이번 달이 기간 밖이면 이번 달 남은 납부액이 없다");
  assert.deepEqual(view.fixed?.map((f) => f.name), ["매달"]);
  // 말일 규칙: 11월 30일, 1월 31일
  assert.deepEqual(
    view.summary?.details.rows.filter((r) => r.name === "매달").map((r) => r.date).sort(),
    ["2026-11-30", "2026-12-31", "2027-01-31"],
  );
});

test("특정 달: 연 주기는 납부 월이 그 달일 때만, 과거 달은 비활성이어도 그때 기간 안이면 포함", () => {
  const june = buildShareView(source({ mode: "month", start: "2027-06", end: "2027-06" }), NOW);
  assert.deepEqual(june.summary?.months.map((m) => m.total), [10_000 + OUT_FIXED + OUT_YEARLY], "2027-06: 매달 + 3월에 시작한 항목 + 연 1회");
  const may = buildShareView(source({ mode: "month", start: "2027-05", end: "2027-05" }), NOW);
  assert.equal(JSON.stringify(may).includes(String(OUT_YEARLY)), false, "납부 월이 아니면 연 주기 없음");
  const past = buildShareView(source({ mode: "month", start: "2026-06", end: "2026-06" }, { fixed: [...fixed, fx({ id: "e", name: "지금은 끈 것", active: false, amount: 2_000 })] }), NOW);
  assert.deepEqual(past.fixed?.map((f) => f.name).sort(), ["끝난 것", "매달", "연 1회", "지금은 끈 것"].sort(), "2026-06: 종료 전·6월 납부·지금은 비활성인 항목");
  assert.equal(JSON.stringify(past).includes(String(OUT_YEARLY)), true, "6월은 연 1회 납부 월");
  const july = buildShareView(source({ mode: "month", start: "2026-07", end: "2026-07" }), NOW);
  assert.equal(JSON.stringify(july).includes("끝난 것"), false, "종료일 다음 달부터는 없다");
});

test("이번 달(current): 열람 시점의 달 하나, 이번 달 남은 납부액 포함", () => {
  const view = buildShareView(source(CURRENT_PERIOD), NOW);
  assert.deepEqual(view.period.months, ["2026-10"]);
  assert.equal(view.summary?.charts?.months, undefined, "한 달이면 월별 막대 없음");
  assert.ok(view.summary?.current);
  assert.equal(periodMonths(CURRENT_PERIOD, "2027-01-01")[0], "2027-01");
});

test("금액 숨김 + 범위: 차트·합계·금액 없이 이름순 목록과 건수만", () => {
  const view = buildShareView(source(RANGE, { masks: { amounts: true, details: true } }), NOW);
  const json = JSON.stringify(view);
  assert.equal(view.summary?.charts, undefined);
  assert.equal(view.summary?.details.query.sort, "name");
  assert.ok(view.summary?.months.every((m) => m.total === null && m.fixed === null && m.planned === null));
  for (const n of [10_000, 12_000, IN_PLANNED]) assert.equal(json.includes(String(n)), false, String(n));
});

test("기간 정규화(읽기): 형식·순서·12개월 초과·current 의 남은 값은 null, 열이 없으면 current", () => {
  assert.deepEqual(normalizePeriod(null, null, null), CURRENT_PERIOD);
  assert.deepEqual(normalizePeriod(undefined, undefined, undefined), CURRENT_PERIOD);
  assert.deepEqual(normalizePeriod("month", "2026-03", "2026-03"), { mode: "month", start: "2026-03", end: "2026-03" });
  assert.deepEqual(normalizePeriod("range", "2026-01", "2026-12"), { mode: "range", start: "2026-01", end: "2026-12" });
  for (const bad of [
    ["current", "2026-01", null],
    ["month", "2026-03", "2026-04"],
    ["month", "2026-13", "2026-13"],
    ["range", "2026-05", "2026-04"],
    ["range", "2026-01", "2027-01"],
    ["range", "2026-1", "2026-02"],
    ["weekly", null, null],
  ]) {
    assert.equal(normalizePeriod(bad[0], bad[1], bad[2]), null, JSON.stringify(bad));
  }
});

test("기간 입력(생성): 이번 달 −120 ~ +12, 시작 ≤ 끝, 최대 12개월", () => {
  assert.deepEqual(parseSharePeriod({}, TODAY), { ok: true, value: CURRENT_PERIOD });
  assert.deepEqual(parseSharePeriod({ period_mode: "month", period_month: "2027-10" }, TODAY), { ok: true, value: { mode: "month", start: "2027-10", end: "2027-10" } });
  assert.deepEqual(parseSharePeriod({ period_mode: "range", period_start: "2026-11", period_end: "2027-10" }, TODAY), {
    ok: true,
    value: { mode: "range", start: "2026-11", end: "2027-10" },
  });
  for (const bad of [
    { period_mode: "month", period_month: "2027-11" },
    { period_mode: "month", period_month: "2016-09" },
    { period_mode: "month", period_month: "" },
    { period_mode: "range", period_start: "2026-11", period_end: "2026-10" },
    { period_mode: "range", period_start: "2026-10", period_end: "2027-10" },
    { period_mode: "range", period_start: "2027-01", period_end: "2027-11" },
    { period_mode: "forever" },
  ]) {
    assert.equal(parseSharePeriod(bad, TODAY).ok, false, JSON.stringify(bad));
  }
});

test("저장: 이번 달 링크는 기간 열 없이(0007 전에도 가능), 특정 달·범위는 기간 열과 함께 넣고 감사 기록에 기간을 남긴다", async () => {
  const respond = (c: { text: string }) => (c.text.startsWith("SELECT count") ? { rows: [{ n: "0" }] } : c.text.startsWith("INSERT INTO myfp.share_links") ? { rows: [{ id: "x" }] } : { rows: [], rowCount: 1 });
  const cur = fakeDb(respond);
  await createShareLink(cur.db, ME, { label: "a", scopes: ["summary"], masks: { amounts: true, details: true }, expiresAt: null, period: CURRENT_PERIOD }, "a".repeat(64));
  assert.doesNotMatch(cur.calls.find((c) => c.text.startsWith("INSERT INTO myfp.share_links"))!.text, /period_/);
  const rng = fakeDb(respond);
  await createShareLink(rng.db, ME, { label: "a", scopes: ["summary"], masks: { amounts: true, details: true }, expiresAt: null, period: RANGE }, "a".repeat(64));
  const insert = rng.calls.find((c) => c.text.startsWith("INSERT INTO myfp.share_links"))!;
  assert.deepEqual(insert.params.slice(6), ["range", "2026-11", "2027-01"]);
  const audit = rng.calls.find((c) => c.text.startsWith("INSERT INTO myfp.audit_log"))!;
  assert.match(String(audit.params.at(-1)), /"period":\{"mode":"range"/);
});

test("열람: 저장된 기간이 어긋난 링크는 다른 실패와 같은 null 이고 데이터를 읽지 않는다", async () => {
  const { token } = generateShareToken();
  const f = fakeDb((c) =>
    c.text.includes("FROM myfp.share_links s JOIN myfp.users")
      ? {
          rows: [
            {
              id: "12345678-1234-4234-8234-123456789012",
              label: "x",
              scopes: ["summary"],
              masks: { amounts: false, details: true },
              created_at: NOW,
              expires_at: null,
              revoked_at: null,
              view_count: 0,
              last_viewed_at: null,
              owner_id: ME,
              owner_status: "active",
              period_mode: "range",
              period_start: "2025-01",
              period_end: "2026-12",
            },
          ],
        }
      : { rows: [] },
  );
  assert.equal(await resolveShareView(f.db, token, NOW), null);
  assert.equal(f.calls.length, 1, "고정지출·예정지출 조회 없음");
});

test("보관한 고정지출은 어떤 기간 링크에도(과거 달·금액 숨김 포함) 이름·금액이 나오지 않는다. 비활성이던 항목은 그때 기간 안이면 남는다", () => {
  const ARCHIVED = 8_181_818;
  const items = [
    ...fixed,
    fx({ id: "z", name: "보관한 비활성 항목", amount: ARCHIVED, active: false, archived: true, startDate: "2026-01-01" }),
    fx({ id: "y", name: "비활성 지난 항목", amount: 2_020, active: false, startDate: "2026-01-01" }),
  ];
  const past: SharePeriod = { mode: "range", start: "2026-05", end: "2026-08" };
  for (const masks of [{ amounts: false, details: true }, { amounts: true, details: true }]) {
    const json = JSON.stringify(buildShareView(source(past, { fixed: items, masks }), NOW));
    assert.equal(json.includes("보관한 비활성 항목"), false, JSON.stringify(masks));
    assert.equal(json.includes(String(ARCHIVED)), false, JSON.stringify(masks));
    assert.ok(json.includes("비활성 지난 항목"), "비활성은 과거 기간에 남는다");
  }
});
