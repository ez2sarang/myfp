import Link from "next/link";
import { ListControls } from "@/components/detail/list-controls";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance/types";
import { HOUSEHOLD_SORTS, HOUSEHOLD_SORT_LABELS, type HouseholdOccurrence, type HouseholdQuery } from "@/lib/household/rules";
import { cn } from "@/lib/utils";

interface MemberView {
  key: string;
  tag: string;
  isSelf: boolean;
  active: boolean;
  color: string;
}

const hidden = (values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);

// 구성원 선택 칩: 체크한 구성원만 합산한다(GET 폼, 자바스크립트 없이 동작). 값은 서버가 만든 구성원 키뿐이다.
export function MemberChips({ members, selected, keep }: { members: readonly MemberView[]; selected: readonly string[]; keep: Record<string, string> }) {
  const rest: Record<string, string> = { ...keep };
  delete rest.m;
  return (
    <form method="get" action="/app/household" className="flex flex-wrap items-center gap-2" aria-label="합산할 구성원">
      {hidden(rest)}
      <span className="text-xs font-semibold text-muted">구성원</span>
      {members.map((m) => (
        <label
          key={m.key}
          className={cn(
            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium sm:min-h-9",
            selected.includes(m.key) ? "border-line-strong bg-surface" : "border-line bg-bg-alt text-muted",
          )}
        >
          <input type="checkbox" name="m" value={m.key} defaultChecked={selected.includes(m.key)} className="size-4 accent-[var(--brand)]" />
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: m.color }} />
          {m.tag}
          {m.isSelf ? <span className="text-xs text-muted">(나)</span> : null}
          {!m.active ? <span className="text-xs text-muted">(지금 합산에 포함되지 않음)</span> : null}
        </label>
      ))}
      <button type="submit" className={buttonClass("secondary", "sm", "min-h-11 sm:min-h-9")}>
        적용
      </button>
    </form>
  );
}

// 합산 세부 항목: 소유 태그 칩, 정렬(금액·날짜·이름·분류·소유자)·방향·분류 필터(GET 폼), 소유자 필터(링크).
export function HouseholdDetailCard({
  details,
  members,
  keep,
}: {
  details: { query: HouseholdQuery; categories: { key: string; label: string }[]; rows: HouseholdOccurrence[]; count: number; total: number };
  members: readonly MemberView[];
  keep: Record<string, string>;
}) {
  const colorOf = new Map(members.map((m) => [m.key, m.color]));
  const ownerKeep = { ...keep, ...(details.query.owner ? { owner: details.query.owner } : {}) };
  const ownerHref = (owner: string | null) => {
    const sp = new URLSearchParams({ ...keep, sort: details.query.sort, dir: details.query.dir, ...(details.query.cat ? { cat: details.query.cat } : {}) });
    if (owner) sp.set("owner", owner);
    return `/app/household?${sp.toString()}#detail-list`;
  };
  return (
    <Card id="detail-list" className="flex scroll-mt-28 flex-col lg:h-0 lg:min-h-full">
      <CardHeader className="flex-row items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>세부 항목</CardTitle>
          <p className="num text-sm text-muted">{details.count}건</p>
        </div>
        <p className="flex shrink-0 flex-col items-end text-right">
          <span className="text-xs text-muted">합계(건너뜀 제외)</span>
          <span className="num text-xl font-semibold tracking-[-0.02em]">{formatKRW(details.total)}</span>
        </p>
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-1">
        <ListControls
          action="/app/household#detail-list"
          sorts={HOUSEHOLD_SORTS.map((s) => ({ key: s, label: HOUSEHOLD_SORT_LABELS[s] }))}
          query={details.query}
          categories={details.categories}
          keep={ownerKeep}
          label="합산 세부 항목"
        />
        <nav aria-label="소유자 필터" className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3 text-xs">
          <span className="w-8 shrink-0 font-semibold text-muted">소유</span>
          <Link
            href={ownerHref(null)}
            aria-current={details.query.owner === null ? "true" : undefined}
            className={cn("inline-flex min-h-11 items-center rounded-full border px-3 font-semibold sm:min-h-8", details.query.owner === null ? "border-transparent bg-btn text-btn-ink" : "border-line-strong bg-surface")}
          >
            전체
          </Link>
          {members.map((m) => (
            <Link
              key={m.key}
              href={ownerHref(m.key)}
              aria-current={details.query.owner === m.key ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 font-semibold sm:min-h-8",
                details.query.owner === m.key ? "border-transparent bg-btn text-btn-ink" : "border-line-strong bg-surface",
              )}
            >
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: m.color }} />
              {m.tag}
            </Link>
          ))}
        </nav>
        {details.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">보여 줄 항목이 없습니다.</p>
        ) : (
          <ol tabIndex={0} aria-label="합산 세부 항목 목록" className="-mx-2 flex max-h-[420px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto overscroll-contain px-2 text-sm lg:max-h-none">
            {details.rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.7rem] font-semibold">
                      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: colorOf.get(r.ownerKey) }} />
                      {r.ownerTag}
                    </span>
                    <span className={cn("font-semibold text-ink", r.skipped && "text-muted line-through")}>{r.name}</span>
                    <Badge>{EXPENSE_CATEGORY_LABELS[r.category]}</Badge>
                    {r.skipped ? <Badge>건너뜀</Badge> : null}
                  </span>
                  <span className="num text-xs text-muted">{r.date ? formatDate(r.date) : "납부일 미정"}</span>
                </div>
                <span className={cn("num shrink-0 pt-0.5 text-right text-[0.95rem] font-semibold tracking-[-0.01em] text-ink", r.skipped && "text-muted line-through")}>
                  {formatKRW(r.amount)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
