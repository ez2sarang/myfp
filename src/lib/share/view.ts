// 공유 보기 데이터 만들기 (순수 모듈). 공유 페이지는 이 함수의 결과만 화면에 넘긴다.
//  - 선택하지 않은 섹션은 결과에 아예 없다.
//  - 가림은 서버에서 값을 제거하는 방식이다: 금액 숨김이면 금액 필드가 null 이고, 메모·기관명 숨김이면 그 필드가 결과에 없다.
//    (숨긴 값을 클라이언트로 보내고 CSS 로 감추지 않는다.)
//  - 사용자 식별 정보(이메일·이름·사용자 id)와 항목 id 는 입력으로 받지도 않고 결과에도 없다.
//  - 금액을 숨기면 차트(도넛·월별 막대·자산 구성·자산 vs 부채)와 비중(%)을 결과에 아예 넣지 않는다.
//    비중만으로도 금액 하나를 알면 나머지를 역산할 수 있기 때문이다. 이때는 이름·분류·납부일 같은 비금액 목록만 보낸다.
//  - 요약·고정지출 목록은 링크의 기간(이번 달·특정 달·최대 12개월 범위) 안의 달만 계산한다. 기간 밖 달의 발생·합계·차트 점은 결과에 없다.
//    (예정지출·달별 덮어쓰기도 기간 안의 달만 반영한다.) 자산·부채는 시점 값이라 열람 시점의 현재 값이다.
import {
  assetDonut,
  assetLiabilityCompare,
  categoryDonut,
  monthTrendStack,
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
  defaultFixedSort,
  assetDetails,
  parseListQuery,
  type AssetDetails,
  type AssetSort,
  type FixedSort,
  type ListQuery,
} from "../finance/detail-list.ts";
import {
  monthLabel,
  monthOccurrences,
  occurrenceDetails,
  summarizeMonth,
  type FixedOverride,
  type Occurrence,
  type OccurrenceState,
  type PlannedExpense,
} from "../finance/occurrences.ts";
import { ASSET_CATEGORIES, EXPENSE_CATEGORIES } from "../finance/types.ts";
import { formatBillingDay } from "../finance/format.ts";
import { monthlyEquivalent } from "../finance/schedule.ts";
import { summarizeBalances } from "../finance/summary.ts";
import {
  CYCLE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  balanceCategoryLabel,
  type BalanceItem,
  type FixedExpense,
} from "../finance/types.ts";
import { periodLabel, periodMonths, type ShareMasks, type SharePeriod, type ShareScope } from "./options.ts";

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

/** 공유 보기의 발생 한 줄 (항목 id 없음) */
export interface ShareOccurrenceRow {
  month: string;
  date: string | null;
  name: string;
  category: string;
  kind: "fixed" | "planned";
  /** 분할 묶음이면 "2/6회" */
  installment: string | null;
  state: OccurrenceState;
  amount: number | null;
}

export interface ShareOccurrenceDetails {
  query: ListQuery<FixedSort>;
  categories: { key: string; label: string }[];
  rows: ShareOccurrenceRow[];
  count: number;
  /** 보이는 행 합계(건너뜀 제외). 금액 숨김이면 null */
  total: number | null;
}

export interface ShareView {
  createdOn: string;
  expiresOn: string | null;
  masks: ShareMasks;
  /** 공유 기간 (요약·고정지출 목록에 적용) */
  period: { mode: SharePeriod["mode"]; label: string; months: string[] };
  summary?: {
    /** 금액을 보여 줄 때만 있다. months 는 기간이 두 달 이상일 때만 */
    charts?: { categories: DonutData; months?: StackData };
    /** 세부 항목(기간 안 발생, 정렬·필터 적용). 금액을 숨기면 행에 금액이 없고 금액순을 쓸 수 없다 */
    details: ShareOccurrenceDetails;
    sorts: readonly FixedSort[];
    /** 기간 합계 (건너뜀 제외) */
    total: number | null;
    fixedTotal: number | null;
    plannedTotal: number | null;
    count: number;
    /** 기간에 이번 달이 들어 있을 때만: 이번 달의 납부 완료/남음 */
    current?: { paidTotal: number | null; paidCount: number; remainingTotal: number | null; remainingCount: number };
    /** 달별 합계 (기간 안의 달만) */
    months: { month: string; label: string; count: number; fixed: number | null; planned: number | null; total: number | null }[];
    byCategory: { label: string; count: number; amount: number | null }[];
  };
  fixed?: ShareViewFixedRow[];
  balances?: {
    /** 금액을 보여 줄 때만 있다 */
    charts?: { composition: DonutData; compare: CompareData };
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
  /** 공유 기간 (요약·고정지출 목록) */
  period: SharePeriod;
  /** 기간 안의 달 계산에 쓰는 달별 덮어쓰기·예정지출 (요약 섹션에만 반영) */
  overrides?: readonly FixedOverride[];
  planned?: readonly PlannedExpense[];
}

/** 세부 목록 쿼리(sort·dir·cat, 자산은 asort·adir·acat). 허용 목록 밖의 값은 무시한다. */
export type ShareListParams = Readonly<Record<string, string | string[] | undefined>>;

export function buildShareView(source: ShareSource, now: Date, params: ShareListParams = {}): ShareView {
  const { masks } = source;
  const today = seoulToday(now);
  const money = (value: number | null): number | null => (masks.amounts ? null : value);
  const months = periodMonths(source.period, today);
  const view: ShareView = {
    createdOn: seoulToday(source.createdAt),
    expiresOn: source.expiresAt ? seoulToday(source.expiresAt) : null,
    masks: { amounts: masks.amounts, details: masks.details },
    period: { mode: source.period.mode, label: periodLabel(source.period), months },
  };
  const fixedFor = (m: string) => monthOccurrences(source.fixed, source.overrides ?? [], [], m, today);

  if (source.scopes.includes("summary")) {
    const perMonth = months.map((m) => ({ month: m, occurrences: monthOccurrences(source.fixed, source.overrides ?? [], source.planned ?? [], m, today) }));
    const all: Occurrence[] = perMonth.flatMap((p) => p.occurrences);
    const sums = perMonth.map((p) => summarizeMonth(p.occurrences, p.month, today));
    const counted = all.filter((o) => !o.skipped);
    const total = counted.reduce((sum, o) => sum + o.amount, 0);
    const fixedTotal = counted.filter((o) => o.kind === "fixed").reduce((sum, o) => sum + o.amount, 0);
    const cats = new Map<string, { category: (typeof all)[number]["category"]; label: string; count: number; amount: number }>();
    for (const o of counted) {
      const c = cats.get(o.category) ?? { category: o.category, label: EXPENSE_CATEGORY_LABELS[o.category], count: 0, amount: 0 };
      c.count += 1;
      c.amount += o.amount;
      cats.set(o.category, c);
    }
    // 금액을 숨기면 금액 순 정렬도 상대 크기를 드러내므로 이름 순으로 바꾼다.
    const slices = [...cats.values()].sort((a, b) => (masks.amounts ? a.label.localeCompare(b.label, "ko") : b.amount - a.amount || a.label.localeCompare(b.label, "ko")));
    // 금액을 숨기면 금액순을 허용하지 않고 기본 정렬을 이름순으로 고정한다(요청에 금액순이 있어도 무시).
    const fixedSorts = masks.amounts ? MASKED_FIXED_SORTS : FIXED_SORTS;
    const query = parseListQuery<FixedSort>(params, { sorts: fixedSorts, defaultSort: defaultFixedSort(masks.amounts), categories: EXPENSE_CATEGORIES });
    const monthOf = new Map(perMonth.flatMap((p) => p.occurrences.map((o) => [o, p.month] as const)));
    const d = occurrenceDetails(all, query);
    const currentIndex = sums.findIndex((x) => x.timing === "current");
    const cur = currentIndex >= 0 ? sums[currentIndex] : undefined;
    view.summary = {
      details: {
        query: d.query,
        categories: d.categories,
        rows: d.rows.map((o) => ({
          month: monthOf.get(o) as string,
          date: o.date,
          name: o.name,
          category: EXPENSE_CATEGORY_LABELS[o.category],
          kind: o.kind,
          installment: o.total ? `${o.seq}/${o.total}회` : null,
          state: o.state,
          amount: money(o.amount),
        })),
        count: d.count,
        total: money(d.total),
      },
      sorts: fixedSorts,
      ...(masks.amounts
        ? {}
        : {
            charts: {
              categories: categoryDonut(slices.map((c) => ({ category: c.category, monthly: c.amount }))),
              ...(months.length > 1 ? { months: monthTrendStack(sums.map((x) => ({ month: x.month, fixed: x.fixedTotal, planned: x.plannedTotal, total: x.total }))) } : {}),
            },
          }),
      total: money(total),
      fixedTotal: money(fixedTotal),
      plannedTotal: money(total - fixedTotal),
      count: counted.length,
      ...(cur
        ? { current: { paidTotal: money(cur.paidTotal), paidCount: cur.paidCount, remainingTotal: money(cur.remainingTotal), remainingCount: cur.remainingCount } }
        : {}),
      months: sums.map((x) => ({
        month: x.month,
        label: monthLabel(x.month),
        count: perMonth.find((p) => p.month === x.month)!.occurrences.length - x.skippedCount,
        fixed: money(x.fixedTotal),
        planned: money(x.plannedTotal),
        total: money(x.total),
      })),
      byCategory: slices.map((c) => ({ label: c.label, count: c.count, amount: money(c.amount) })),
    };
  }

  if (source.scopes.includes("fixed")) {
    // 기간 안의 달에 발생이 있는 고정지출 정의만 (이번 달·미래 달은 활성 항목, 과거 달은 그때 기간 안이던 항목)
    const inPeriod = new Set(months.flatMap((m) => fixedFor(m).map((o) => o.id)));
    view.fixed = source.fixed
      .filter((f) => inPeriod.has(f.id))
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
    // 금액을 숨기면 목록 순서(저장소는 금액 큰 순)도 크기 순위를 드러내므로 분류 → 이름 순으로 다시 정렬한다.
    const ordered = masks.amounts
      ? [...source.balances].sort(
          (a, b) =>
            balanceCategoryLabel(a.kind, a.category).localeCompare(balanceCategoryLabel(b.kind, b.category), "ko") ||
            a.name.localeCompare(b.name, "ko") ||
            (a.asOf ?? "").localeCompare(b.asOf ?? "") ||
            a.id.localeCompare(b.id),
        )
      : source.balances;
    const assetSorts = masks.amounts ? MASKED_ASSET_SORTS : ASSET_SORTS;
    const assetQuery = parseListQuery<AssetSort>(params, { sorts: assetSorts, defaultSort: masks.amounts ? "name" : "amount", categories: ASSET_CATEGORIES, prefix: "a" });
    view.balances = {
      details: assetDetails(source.balances, assetQuery, { hideAmounts: masks.amounts, hideDetails: masks.details }),
      sorts: assetSorts,
      ...(masks.amounts ? {} : { charts: { composition: assetDonut(source.balances), compare: assetLiabilityCompare(totals) } }),
      assets: ordered.filter((b) => b.kind === "asset").map(toRow),
      liabilities: ordered.filter((b) => b.kind === "liability").map(toRow),
      assetsTotal: money(totals.assetsTotal),
      liabilitiesTotal: money(totals.liabilitiesTotal),
      netWorth: money(totals.netWorth),
    };
  }
  return view;
}
