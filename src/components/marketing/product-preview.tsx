"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DEMO_ITEMS, DEMO_SUMMARY, type DemoItem } from "./content";

// 히어로의 제품 미리보기. 실제 대시보드와 같은 문법(요약 네 칸 → 분류 도넛 + 정렬되는 세부 목록)을 가상의 숫자로 보여 준다.
// 정렬 버튼은 실제로 동작한다(화면 안에서만 정렬, 서버 요청 없음).
const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;

const SORTS = [
  { key: "date", label: "날짜순" },
  { key: "amount", label: "금액순" },
  { key: "name", label: "이름순" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

function sortItems(items: DemoItem[], key: SortKey): DemoItem[] {
  const copy = [...items];
  if (key === "amount") return copy.sort((a, b) => b.amount - a.amount);
  if (key === "name") return copy.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return copy.sort((a, b) => a.dLeft - b.dLeft);
}

function Donut() {
  const total = DEMO_SUMMARY.monthlyTotal;
  const r = 15.9155; // 둘레 100
  let offset = 25;
  return (
    <div className="relative mx-auto size-40 sm:size-44" aria-hidden="true">
      <svg viewBox="0 0 42 42" className="size-full">
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--bg-alt)" strokeWidth="5.5" />
        {DEMO_ITEMS.map((item) => {
          const share = (item.amount / total) * 100;
          const seg = (
            <circle
              key={item.name}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={item.color}
              strokeWidth="5.5"
              strokeDasharray={`${Math.max(share - 0.8, 0.4)} ${100 - Math.max(share - 0.8, 0.4)}`}
              strokeDashoffset={offset}
            />
          );
          offset -= share;
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[0.65rem] text-muted">이 달 합계</span>
        <span className="num text-base font-semibold tracking-tight">{Math.round(total / 10_000)}만원</span>
      </div>
    </div>
  );
}

export function ProductPreview() {
  const [sort, setSort] = useState<SortKey>("date");
  const rows = sortItems(DEMO_ITEMS, sort);
  const total = DEMO_SUMMARY.monthlyTotal;
  const kpis = [
    { label: "이 달 지출 합계", value: won(total), hint: `고정 ${DEMO_SUMMARY.fixedCount}건 · 예정 ${DEMO_SUMMARY.plannedCount}건` },
    { label: "이번 달 남은 납부액", value: won(DEMO_SUMMARY.remaining), hint: `이달 말까지 ${DEMO_SUMMARY.remainingCount}건` },
    { label: "다음 납부", value: DEMO_SUMMARY.next.label, hint: DEMO_SUMMARY.next.hint },
    { label: "순자산", value: won(DEMO_SUMMARY.netWorth), hint: DEMO_SUMMARY.netWorthHint },
  ];

  return (
    <figure
      aria-label="대시보드 예시 화면 (가상 데이터)"
      className="relative overflow-hidden rounded-xl border border-line bg-surface/90 text-left shadow-float backdrop-blur"
    >
      <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5 sm:px-5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="text-xs font-medium text-muted">대시보드</span>
        <figcaption className="ml-auto rounded-full border border-line bg-surface px-2 py-0.5 text-[0.65rem] font-medium text-muted">
          예시 화면 · 가상 데이터
        </figcaption>
      </div>

      <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-5">
        {/* 실제 대시보드의 탭과 달 이동 (장식, 동작하지 않음) */}
        <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-2 border-b border-line">
          <span className="flex gap-3 text-xs font-semibold">
            {["이번 달", "예정지출", "내역"].map((tab, i) => (
              <span key={tab} className={cn("-mb-px border-b-2 pb-2", i === 0 ? "border-brand text-ink" : "border-transparent text-muted")}>
                {tab}
              </span>
            ))}
          </span>
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[0.7rem] font-semibold">
            <span className="text-muted">‹</span> 이번 달 <span className="text-muted">›</span>
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className={cn(
                "flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-surface p-3 sm:p-4",
                i === 0 && "border-t-2 border-t-brand",
              )}
            >
              <dt className="truncate text-[0.7rem] font-medium text-muted sm:text-xs">{k.label}</dt>
              <dd className="num truncate text-base font-semibold tracking-tight sm:text-xl">{k.value}</dd>
              <dd className="truncate text-[0.65rem] text-muted sm:text-[0.7rem]">{k.hint}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <p className="text-sm font-semibold tracking-tight">분류별 이 달 지출</p>
            <div className="grid flex-1 items-center gap-4 sm:grid-cols-[auto_1fr] md:grid-cols-1 lg:grid-cols-[auto_1fr]">
              <Donut />
              <ul className="flex flex-col gap-1.5 text-xs">
                {DEMO_ITEMS.map((item) => (
                  <li key={item.name} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
                    <span className="flex-1 truncate">{item.category}</span>
                    <span className="num text-muted">{((item.amount / total) * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="border-t border-line pt-3 text-[0.7rem] text-muted">분류를 누르면 오른쪽 목록이 그 분류만 보여 줍니다.</p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold tracking-tight">세부 항목</p>
              <div role="group" aria-label="예시 목록 정렬" className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={sort === s.key}
                    onClick={() => setSort(s.key)}
                    className={cn(
                      "min-h-9 rounded-[7px] px-2.5 text-xs font-semibold transition-colors sm:min-h-8",
                      sort === s.key ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <ol className="flex flex-col divide-y divide-line text-sm" aria-live="polite">
              {rows.map((item) => (
                <li key={item.name} className="flex items-center gap-3 py-2">
                  <span className="num w-11 shrink-0 rounded-md bg-brand-soft py-1 text-center text-[0.7rem] font-semibold text-brand">
                    D-{item.dLeft}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="truncate text-[0.7rem] text-muted">
                      {item.planned ? `${item.planned} · ${item.day}일` : `매월 ${item.day}일`} · {item.method}
                    </span>
                  </span>
                  <span className="num shrink-0 font-semibold">{won(item.amount)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </figure>
  );
}
