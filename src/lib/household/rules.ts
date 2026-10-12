// 함께 보기(그룹 합산) 규칙 (순수 모듈): 이름·태그 검증, 구성원 선택 쿼리 검증, 방장 승계, 합산 목록 정렬·필터, 색.
// 화면이 다루는 구성원 식별자는 서버가 만든 키(m1~m6, 가입 순)뿐이고, 사용자 id·그룹 id 는 클라이언트로 보내지 않는다.
import { checkShortName, shortNameMessage } from "../account/display-name.ts";
import type { SortDir } from "../finance/detail-list.ts";
import type { StackData } from "../finance/charts.ts";
import { monthOccurrences, type FixedOverride, type Occurrence } from "../finance/occurrences.ts";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, isOneOf, type ExpenseCategory } from "../finance/types.ts";

export const MAX_MEMBERS = 6;
export const MAX_ACTIVE_INVITES = 5;
export const INVITE_DAYS = 7;
export const HOUSEHOLD_NAME_MAX = 30;
export const TAG_MAX = 12;

/** 구성원 색 (가입 순서대로) */
export const MEMBER_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-6)", "var(--chart-8)"] as const;

export type ShortText = { ok: true; value: string } | { ok: false; message: string };

// 표시 이름과 같은 규칙(NFC, 보이지 않는 문자·한글 채움 문자·결합 문자 과다 거부, 보이는 글자 1개 이상)
function shortText(raw: unknown, max: number, label: string): ShortText {
  const r = checkShortName(raw, max);
  return r.ok ? r : { ok: false, message: shortNameMessage(r.reason, label, max) };
}

export const validateHouseholdName = (raw: unknown): ShortText => shortText(raw, HOUSEHOLD_NAME_MAX, "그룹 이름");
export const validateTag = (raw: unknown): ShortText => shortText(raw, TAG_MAX, "태그");

const isOn = (raw: unknown): boolean => raw === "on" || raw === "1" || raw === "true";
/** 내놓을 범위 체크박스 (없으면 꺼짐) */
export const parseShareScope = (fields: Readonly<Record<string, string | undefined>>) => ({ shareFixed: isOn(fields.share_fixed), shareBalances: isOn(fields.share_balances) });

export interface MemberRef {
  userId: string;
  role: "owner" | "member";
  joinedAt: Date;
  /** 계정이 활성(users.status = 'active')인지 */
  active: boolean;
}

/**
 * 방장이 나갈 때 넘겨받을 사람: 남는 활성 구성원 중 가장 먼저 가입한 사람(같으면 id 순).
 * 활성 구성원이 없으면 남는 구성원 중 가장 먼저 가입한 사람, 아무도 없으면 null(그룹 삭제).
 */
export function pickSuccessor(members: readonly MemberRef[], leavingUserId: string): string | null {
  const rest = members.filter((m) => m.userId !== leavingUserId);
  rest.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId));
  return (rest.find((m) => m.active) ?? rest[0])?.userId ?? null;
}

/** ?m= 구성원 선택(반복 값 또는 쉼표 구분): 내 그룹 구성원 키와 교집합만. 없거나 교집합이 비면 전체 */
export function parseMemberSelection(raw: string | string[] | undefined, memberKeys: readonly string[]): string[] {
  const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
    .slice(0, 20)
    .flatMap((v) => v.split(",").slice(0, 20));
  const picked = memberKeys.filter((k) => values.includes(k));
  return picked.length > 0 ? picked : [...memberKeys];
}

export const HOUSEHOLD_SORTS = ["amount", "date", "name", "category", "owner"] as const;
export type HouseholdSort = (typeof HOUSEHOLD_SORTS)[number];
export const HOUSEHOLD_SORT_LABELS: Record<HouseholdSort, string> = { amount: "금액순", date: "날짜순", name: "이름순", category: "분류순", owner: "소유자순" };

export interface HouseholdQuery {
  sort: HouseholdSort;
  dir: SortDir;
  cat: ExpenseCategory | null;
  owner: string | null;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 정렬·방향·분류·소유자 필터 쿼리 (허용 목록, 소유자는 선택된 구성원 키만) */
export function parseHouseholdQuery(raw: Readonly<Record<string, string | string[] | undefined>>, memberKeys: readonly string[]): HouseholdQuery {
  const sortRaw = first(raw.sort);
  const sort: HouseholdSort = isOneOf(HOUSEHOLD_SORTS, sortRaw) ? sortRaw : "amount";
  const dirRaw = first(raw.dir);
  const dir: SortDir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : sort === "amount" ? "desc" : "asc";
  const catRaw = first(raw.cat);
  const ownerRaw = first(raw.owner);
  return { sort, dir, cat: isOneOf(EXPENSE_CATEGORIES, catRaw) ? catRaw : null, owner: ownerRaw && memberKeys.includes(ownerRaw) ? ownerRaw : null };
}

/** 합산 목록의 한 줄: 발생 + 소유자 (id 는 서버가 만든 불투명 값) */
export type HouseholdOccurrence = Occurrence & { ownerKey: string; ownerTag: string };

/** 합산 세부 목록 정렬·필터. 동률은 이름 → 소유자 키 → id */
export function householdDetails(rows: readonly HouseholdOccurrence[], query: HouseholdQuery) {
  const categories = EXPENSE_CATEGORIES.filter((c) => rows.some((r) => r.category === c)).map((key) => ({ key, label: EXPENSE_CATEGORY_LABELS[key] }));
  const cat = query.cat && categories.some((c) => c.key === query.cat) ? query.cat : null;
  const visible = rows.filter((r) => (!cat || r.category === cat) && (!query.owner || r.ownerKey === query.owner));
  const sign = query.dir === "desc" ? -1 : 1;
  const tie = (a: HouseholdOccurrence, b: HouseholdOccurrence) => a.name.localeCompare(b.name, "ko") || a.ownerKey.localeCompare(b.ownerKey) || a.id.localeCompare(b.id);
  const sorted = [...visible].sort((a, b) => {
    let primary = 0;
    if (query.sort === "date") {
      if (a.date !== b.date) {
        if (a.date === null) return 1;
        if (b.date === null) return -1;
        primary = a.date < b.date ? -1 : 1;
      }
    } else if (query.sort === "amount") primary = a.amount - b.amount;
    else if (query.sort === "category") primary = EXPENSE_CATEGORY_LABELS[a.category].localeCompare(EXPENSE_CATEGORY_LABELS[b.category], "ko");
    else if (query.sort === "owner") primary = a.ownerKey.localeCompare(b.ownerKey);
    else primary = a.name.localeCompare(b.name, "ko");
    return primary !== 0 ? primary * sign : tie(a, b);
  });
  return {
    query: { ...query, cat },
    categories,
    rows: sorted,
    count: sorted.length,
    total: sorted.filter((r) => !r.skipped).reduce((s, r) => s + r.amount, 0),
  };
}

/** 소유자별 소계 (건너뜀 제외) */
export function ownerSubtotals(rows: readonly HouseholdOccurrence[], members: readonly { key: string; tag: string }[]) {
  return members.map((m) => {
    const mine = rows.filter((r) => r.ownerKey === m.key && !r.skipped);
    return { key: m.key, tag: m.tag, count: mine.length, total: mine.reduce((s, r) => s + r.amount, 0) };
  });
}

/** 합산 대상 고정지출 (visibleToViewer 결과의 모양: 불투명 id + 소유자 키) */
export interface HouseholdFixedLike {
  id: string;
  ownerKey: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  cycle: "monthly" | "yearly";
  billingDay: number | null;
  billingMonth: number | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  archived: boolean;
  createdOn?: string | null;
}

/** 선택한 구성원의 그 달 발생 + 소유자 정보 (선택 밖 구성원의 항목은 계산에 넣지 않는다) */
export function householdOccurrences(
  fixed: readonly HouseholdFixedLike[],
  overrides: readonly FixedOverride[],
  members: readonly { key: string; tag: string }[],
  selected: readonly string[],
  month: string,
  today: string,
): HouseholdOccurrence[] {
  const picked = new Set(selected);
  const items = fixed.filter((f) => picked.has(f.ownerKey));
  const ownerOf = new Map(items.map((f) => [f.id, f.ownerKey]));
  const tagOf = new Map(members.map((m) => [m.key, m.tag]));
  return monthOccurrences(items, overrides, [], month, today).map((o) => {
    const ownerKey = ownerOf.get(o.id) as string;
    return { ...o, ownerKey, ownerTag: tagOf.get(ownerKey) ?? "" };
  });
}

/** 월별 합산 막대: 기본은 합계 한 계열, split 이면 구성원별로 쌓는다 */
export function householdTrend(
  fixed: readonly HouseholdFixedLike[],
  overrides: readonly FixedOverride[],
  members: readonly { key: string; tag: string; color: string }[],
  selected: readonly string[],
  months: readonly string[],
  today: string,
  split: boolean,
): StackData {
  const shown = members.filter((m) => selected.includes(m.key));
  const series = split ? shown.map((m) => ({ key: m.key, label: m.tag, color: m.color })) : [{ key: "total", label: "합산", color: "var(--chart-1)" }];
  const rows = months.map((month, i) => {
    const occ = householdOccurrences(fixed, overrides, members, selected, month, today).filter((o) => !o.skipped);
    const values: Record<string, number> = {};
    for (const s of series) values[s.key] = split ? occ.filter((o) => o.ownerKey === s.key).reduce((t, o) => t + o.amount, 0) : occ.reduce((t, o) => t + o.amount, 0);
    const [y, m] = month.split("-");
    return {
      month,
      label: i === 0 || m === "01" ? `${(y ?? "").slice(2)}.${Number(m)}월` : `${Number(m)}월`,
      values,
      total: occ.reduce((t, o) => t + o.amount, 0),
    };
  });
  return { series, rows };
}
