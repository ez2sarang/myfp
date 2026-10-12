// 세부 항목 목록의 정렬·필터 (순수 모듈, 서버에서 실행). 대시보드·자산 화면·공유 보기가 같은 함수를 쓴다.
//  - 상태는 URL 쿼리(sort·dir·cat)로 들어오며 허용 목록으로 검증한다(그 밖의 값은 기본값으로).
//  - 날짜순은 schedule.ts 의 nextBillingDate(말일 규칙 포함)를 그대로 쓴다. 다음 납부일이 없는 항목은 방향과 상관없이 맨 뒤.
//  - 동률은 이름 순, 그래도 같으면 입력 순서(안정 정렬).
//  - 금액을 숨기면(hideAmounts) 금액순은 쓸 수 없고(이름순으로 바뀜) 행에 금액을 담지 않는다. 메모·기관 가림(hideDetails)이면 기관 필드가 없다.
import { diffDays } from "./dates.ts";
import { formatBillingDay } from "./format.ts";
import { isInEffect, monthlyEquivalent, nextBillingDate, remainingPayments } from "./schedule.ts";
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  isOneOf,
  type AssetCategory,
  type BalanceItem,
  type ExpenseCategory,
  type FixedExpense,
} from "./types.ts";

export type SortDir = "asc" | "desc";
export const FIXED_SORTS = ["date", "amount", "name", "category"] as const;
export const ASSET_SORTS = ["amount", "name", "asOf", "category"] as const;
export type FixedSort = (typeof FIXED_SORTS)[number];
export type AssetSort = (typeof ASSET_SORTS)[number];
/** 금액을 숨긴 공유 보기에서 허용하는 정렬 */
export const MASKED_FIXED_SORTS = ["date", "name", "category"] as const satisfies readonly FixedSort[];
export const MASKED_ASSET_SORTS = ["asOf", "name", "category"] as const satisfies readonly AssetSort[];

export const SORT_LABELS: Record<FixedSort | AssetSort, string> = { date: "날짜순", amount: "금액순", name: "이름순", category: "분류순", asOf: "기준일순" };

export interface ListQuery<S extends string> {
  sort: S;
  dir: SortDir;
  cat: string | null;
}

type RawParams = Readonly<Record<string, string | string[] | undefined>>;
const firstOf = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** 쿼리 → 정렬·방향·분류. prefix 로 한 화면의 두 목록을 구분한다(예: 공유 보기의 자산 목록은 a). 금액순의 기본 방향은 내림차순, 나머지는 오름차순. */
export function parseListQuery<S extends string>(
  raw: RawParams,
  opts: { sorts: readonly S[]; defaultSort: S; categories: readonly string[]; prefix?: string },
): ListQuery<S> {
  const p = opts.prefix ?? "";
  const sortRaw = firstOf(raw[`${p}sort`]);
  const sort = isOneOf(opts.sorts, sortRaw) ? sortRaw : opts.defaultSort;
  const dirRaw = firstOf(raw[`${p}dir`]);
  const dir: SortDir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : sort === "amount" ? "desc" : "asc";
  const catRaw = firstOf(raw[`${p}cat`]);
  return { sort, dir, cat: isOneOf(opts.categories, catRaw) ? catRaw : null };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ko");

export interface FixedDetailRow {
  name: string;
  category: ExpenseCategory;
  categoryLabel: string;
  amount: number | null;
  schedule: string;
  nextDate: string | null;
  daysLeft: number | null;
  paymentMethod: string | null;
  institution?: string | null;
  endDate: string | null;
  remainingCount: number | null;
}

export interface FixedDetails {
  query: ListQuery<FixedSort>;
  /** 효력 있는 항목에 나오는 분류 (필터 칩용) */
  categories: { key: ExpenseCategory; label: string }[];
  rows: FixedDetailRow[];
  count: number;
  /** 보이는 행의 월 환산 합계. 금액을 숨기면 null */
  monthlyTotal: number | null;
}

/** 효력 있는(활성·미보관·기간 안) 고정지출의 세부 목록 */
export function fixedDetails(
  items: readonly FixedExpense[],
  today: string,
  query: ListQuery<FixedSort>,
  opts: { hideAmounts?: boolean; hideDetails?: boolean } = {},
): FixedDetails {
  const sort: FixedSort = opts.hideAmounts && query.sort === "amount" ? "name" : query.sort;
  const current = items.filter((i) => isInEffect(i, today));
  const categories = EXPENSE_CATEGORIES.filter((c) => current.some((i) => i.category === c)).map((key) => ({ key, label: EXPENSE_CATEGORY_LABELS[key] }));
  const cat = query.cat && categories.some((c) => c.key === query.cat) ? (query.cat as ExpenseCategory) : null;
  const visible = cat ? current.filter((i) => i.category === cat) : current;
  const entries = visible.map((item) => ({ item, next: nextBillingDate(item, today) }));
  const sign = query.dir === "desc" ? -1 : 1;
  entries.sort((a, b) => {
    let primary = 0;
    if (sort === "date") {
      if (a.next !== b.next) {
        if (a.next === null) return 1;
        if (b.next === null) return -1;
        primary = a.next < b.next ? -1 : 1;
      }
    } else if (sort === "amount") primary = a.item.amount - b.item.amount;
    else if (sort === "category") primary = EXPENSE_CATEGORY_LABELS[a.item.category].localeCompare(EXPENSE_CATEGORY_LABELS[b.item.category], "ko");
    else primary = byName(a.item, b.item);
    return primary !== 0 ? primary * sign : byName(a.item, b.item);
  });
  const rows = entries.map(({ item, next }) => {
    const row: FixedDetailRow = {
      name: item.name,
      category: item.category,
      categoryLabel: EXPENSE_CATEGORY_LABELS[item.category],
      amount: opts.hideAmounts ? null : item.amount,
      schedule: formatBillingDay(item.billingDay, item.cycle, item.billingMonth),
      nextDate: next,
      daysLeft: next ? diffDays(next, today) : null,
      paymentMethod: item.paymentMethod ? PAYMENT_METHOD_LABELS[item.paymentMethod] : null,
      endDate: item.endDate,
      remainingCount: remainingPayments(item, today),
    };
    if (!opts.hideDetails) row.institution = item.institution;
    return row;
  });
  return {
    query: { sort, dir: query.dir, cat },
    categories,
    rows,
    count: rows.length,
    monthlyTotal: opts.hideAmounts ? null : visible.reduce((sum, i) => sum + monthlyEquivalent(i), 0),
  };
}

export interface AssetDetailRow {
  name: string;
  category: AssetCategory;
  categoryLabel: string;
  amount: number | null;
  asOf: string | null;
  note?: string | null;
}

export interface AssetDetails {
  query: ListQuery<AssetSort>;
  categories: { key: AssetCategory; label: string }[];
  rows: AssetDetailRow[];
  count: number;
  total: number | null;
}

/** 자산(부채 제외)의 세부 목록. 기준일이 없는 항목은 기준일순에서 맨 뒤. */
export function assetDetails(items: readonly BalanceItem[], query: ListQuery<AssetSort>, opts: { hideAmounts?: boolean; hideDetails?: boolean } = {}): AssetDetails {
  const sort: AssetSort = opts.hideAmounts && query.sort === "amount" ? "name" : query.sort;
  const assets = items.filter((b) => b.kind === "asset");
  const categories = ASSET_CATEGORIES.filter((c) => assets.some((b) => b.category === c)).map((key) => ({ key, label: ASSET_CATEGORY_LABELS[key] }));
  const cat = query.cat && categories.some((c) => c.key === query.cat) ? (query.cat as AssetCategory) : null;
  const visible = (cat ? assets.filter((b) => b.category === cat) : assets).slice();
  const label = (b: BalanceItem) => ASSET_CATEGORY_LABELS[b.category as AssetCategory] ?? b.category;
  const sign = query.dir === "desc" ? -1 : 1;
  visible.sort((a, b) => {
    let primary = 0;
    if (sort === "asOf") {
      if (a.asOf !== b.asOf) {
        if (a.asOf === null) return 1;
        if (b.asOf === null) return -1;
        primary = a.asOf < b.asOf ? -1 : 1;
      }
    } else if (sort === "amount") primary = a.amount - b.amount;
    else if (sort === "category") primary = label(a).localeCompare(label(b), "ko");
    else primary = byName(a, b);
    return primary !== 0 ? primary * sign : byName(a, b);
  });
  const rows = visible.map((b) => {
    const row: AssetDetailRow = { name: b.name, category: b.category as AssetCategory, categoryLabel: label(b), amount: opts.hideAmounts ? null : b.amount, asOf: b.asOf };
    if (!opts.hideDetails) row.note = b.note;
    return row;
  });
  return {
    query: { sort, dir: query.dir, cat },
    categories,
    rows,
    count: rows.length,
    total: opts.hideAmounts ? null : visible.reduce((sum, b) => sum + b.amount, 0),
  };
}

/** 목록 상태를 쿼리 문자열로 (기본값과 같은 것도 그대로 둔다). keep 은 같은 화면의 다른 목록 상태. */
export function listHref(path: string, prefix: string, q: { sort: string; dir?: SortDir; cat: string | null }, keep: Record<string, string> = {}, hash = ""): string {
  const sp = new URLSearchParams(keep);
  sp.set(`${prefix}sort`, q.sort);
  if (q.dir) sp.set(`${prefix}dir`, q.dir);
  if (q.cat) sp.set(`${prefix}cat`, q.cat);
  else sp.delete(`${prefix}cat`);
  return `${path}?${sp.toString()}${hash}`;
}
