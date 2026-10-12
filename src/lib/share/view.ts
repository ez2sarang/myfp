// 공유 보기 데이터 만들기 (순수 모듈). 공유 페이지는 이 함수의 결과만 화면에 넘긴다.
//  - 선택하지 않은 섹션은 결과에 아예 없다.
//  - 가림은 서버에서 값을 제거하는 방식이다: 금액 숨김이면 금액 필드가 null 이고, 메모·기관명 숨김이면 그 필드가 결과에 없다.
//    (숨긴 값을 클라이언트로 보내고 CSS 로 감추지 않는다.)
//  - 사용자 식별 정보(이메일·이름·사용자 id)와 항목 id 는 입력으로 받지도 않고 결과에도 없다.
//  - 차트 데이터도 같은 규칙이다: 금액을 숨기면 비중(%)만 담는다(가운데 합계·축·툴팁에 쓸 금액이 결과에 없다).
import {
  assetDonut,
  assetLiabilityCompare,
  categoryDonut,
  compareAsPercent,
  donutAsPercent,
  projectionStack,
  stackAsPercent,
  type CompareData,
  type DonutData,
  type StackData,
} from "../finance/charts.ts";
import { seoulToday } from "../finance/dates.ts";
import {
  ASSET_SORTS,
  FIXED_SORTS,
  MASKED_ASSET_SORTS,
  MASKED_FIXED_SORTS,
  assetDetails,
  fixedDetails,
  parseListQuery,
  type AssetDetails,
  type AssetSort,
  type FixedDetails,
  type FixedSort,
} from "../finance/detail-list.ts";
import { ASSET_CATEGORIES, EXPENSE_CATEGORIES } from "../finance/types.ts";
import { formatBillingDay } from "../finance/format.ts";
import { monthlyEquivalent } from "../finance/schedule.ts";
import { summarizeBalances, summarizeFixed } from "../finance/summary.ts";
import {
  CYCLE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  balanceCategoryLabel,
  type BalanceItem,
  type FixedExpense,
} from "../finance/types.ts";
import type { ShareMasks, ShareScope } from "./options.ts";

export interface ShareViewFixedRow {
  name: string;
  category: string;
  cycle: string;
  schedule: string;
  amount: number | null;
  monthly: number | null;
  endDate: string | null;
  paymentMethod: string | null;
  institution?: string | null;
  note?: string | null;
}

export interface ShareViewBalanceRow {
  name: string;
  category: string;
  amount: number | null;
  asOf: string | null;
  monthlyPayment?: number | null;
  endDate?: string | null;
  note?: string | null;
}

export interface ShareView {
  createdOn: string;
  expiresOn: string | null;
  masks: ShareMasks;
  summary?: {
    charts: { categories: DonutData; projection: StackData };
    /** 세부 항목(정렬·필터 적용). 금액을 숨기면 행에 금액이 없고 금액순을 쓸 수 없다 */
    details: FixedDetails;
    sorts: readonly FixedSort[];
    activeCount: number;
    monthlyTotal: number | null;
    annualTotal: number | null;
    byCategory: { label: string; count: number; monthly: number | null }[];
    upcoming: { name: string; category: string; date: string; daysLeft: number; amount: number | null }[];
  };
  fixed?: ShareViewFixedRow[];
  balances?: {
    charts: { composition: DonutData; compare: CompareData };
    details: AssetDetails;
    sorts: readonly AssetSort[];
    assets: ShareViewBalanceRow[];
    liabilities: ShareViewBalanceRow[];
    assetsTotal: number | null;
    liabilitiesTotal: number | null;
    netWorth: number | null;
  };
}

export interface ShareSource {
  scopes: readonly ShareScope[];
  masks: ShareMasks;
  createdAt: Date;
  expiresAt: Date | null;
  fixed: readonly FixedExpense[];
  balances: readonly BalanceItem[];
}

/** 세부 목록 쿼리(sort·dir·cat, 자산은 asort·adir·acat). 허용 목록 밖의 값은 무시한다. */
export type ShareListParams = Readonly<Record<string, string | string[] | undefined>>;

export function buildShareView(source: ShareSource, now: Date, params: ShareListParams = {}): ShareView {
  const { masks } = source;
  const today = seoulToday(now);
  const money = (value: number | null): number | null => (masks.amounts ? null : value);
  const view: ShareView = {
    createdOn: seoulToday(source.createdAt),
    expiresOn: source.expiresAt ? seoulToday(source.expiresAt) : null,
    masks: { amounts: masks.amounts, details: masks.details },
  };
  const visibleFixed = source.fixed.filter((f) => !f.archived);

  if (source.scopes.includes("summary")) {
    const s = summarizeFixed(visibleFixed, today);
    // 금액을 숨기면 금액 순 정렬도 상대 크기를 드러내므로 이름 순으로 바꾼다.
    const slices = masks.amounts ? [...s.byCategory].sort((a, b) => a.label.localeCompare(b.label, "ko")) : s.byCategory;
    const categories = categoryDonut(s.byCategory);
    const projection = projectionStack(visibleFixed, today, 12);
    // 금액을 숨기면 금액순을 허용하지 않고 기본 정렬을 이름순으로 고정한다(요청에 금액순이 있어도 무시).
    const fixedSorts = masks.amounts ? MASKED_FIXED_SORTS : FIXED_SORTS;
    const fixedQuery = parseListQuery<FixedSort>(params, { sorts: fixedSorts, defaultSort: masks.amounts ? "name" : "date", categories: EXPENSE_CATEGORIES });
    view.summary = {
      details: fixedDetails(visibleFixed, today, fixedQuery, { hideAmounts: masks.amounts, hideDetails: masks.details }),
      sorts: fixedSorts,
      charts: masks.amounts
        ? { categories: donutAsPercent(categories), projection: stackAsPercent(projection) }
        : { categories, projection },
      activeCount: s.activeCount,
      monthlyTotal: money(s.monthlyTotal),
      annualTotal: money(s.annualTotal),
      byCategory: slices.map((c) => ({ label: c.label, count: c.count, monthly: money(c.monthly) })),
      upcoming: s.upcoming.map((u) => ({
        name: u.name,
        category: EXPENSE_CATEGORY_LABELS[u.category],
        date: u.date,
        daysLeft: u.daysLeft,
        amount: money(u.amount),
      })),
    };
  }

  if (source.scopes.includes("fixed")) {
    view.fixed = visibleFixed
      .filter((f) => f.active)
      .map((f) => {
        const row: ShareViewFixedRow = {
          name: f.name,
          category: EXPENSE_CATEGORY_LABELS[f.category],
          cycle: CYCLE_LABELS[f.cycle],
          schedule: formatBillingDay(f.billingDay, f.cycle, f.billingMonth),
          amount: money(f.amount),
          monthly: money(monthlyEquivalent(f)),
          endDate: f.endDate,
          paymentMethod: f.paymentMethod ? PAYMENT_METHOD_LABELS[f.paymentMethod] : null,
        };
        if (!masks.details) {
          row.institution = f.institution;
          row.note = f.note;
        }
        return row;
      });
  }

  if (source.scopes.includes("balances")) {
    const totals = summarizeBalances(source.balances);
    const toRow = (b: BalanceItem): ShareViewBalanceRow => {
      const row: ShareViewBalanceRow = { name: b.name, category: balanceCategoryLabel(b.kind, b.category), amount: money(b.amount), asOf: b.asOf };
      if (b.kind === "liability") {
        row.monthlyPayment = money(b.monthlyPayment);
        row.endDate = b.endDate;
      }
      if (!masks.details) row.note = b.note;
      return row;
    };
    const composition = assetDonut(source.balances);
    const compare = assetLiabilityCompare(totals);
    // 금액을 숨기면 목록 순서(저장소는 금액 큰 순)도 크기 순위를 드러내므로 분류 → 이름 순으로 다시 정렬한다.
    const ordered = masks.amounts
      ? [...source.balances].sort(
          (a, b) =>
            balanceCategoryLabel(a.kind, a.category).localeCompare(balanceCategoryLabel(b.kind, b.category), "ko") || a.name.localeCompare(b.name, "ko"),
        )
      : source.balances;
    const assetSorts = masks.amounts ? MASKED_ASSET_SORTS : ASSET_SORTS;
    const assetQuery = parseListQuery<AssetSort>(params, { sorts: assetSorts, defaultSort: masks.amounts ? "name" : "amount", categories: ASSET_CATEGORIES, prefix: "a" });
    view.balances = {
      details: assetDetails(source.balances, assetQuery, { hideAmounts: masks.amounts, hideDetails: masks.details }),
      sorts: assetSorts,
      charts: masks.amounts ? { composition: donutAsPercent(composition), compare: compareAsPercent(compare) } : { composition, compare },
      assets: ordered.filter((b) => b.kind === "asset").map(toRow),
      liabilities: ordered.filter((b) => b.kind === "liability").map(toRow),
      assetsTotal: money(totals.assetsTotal),
      liabilitiesTotal: money(totals.liabilitiesTotal),
      netWorth: money(totals.netWorth),
    };
  }
  return view;
}
