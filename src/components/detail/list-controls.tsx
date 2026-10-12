import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { cn } from "@/lib/utils";

// 세부 목록의 정렬·방향·분류 컨트롤. 상태는 URL 쿼리로만 둔다: 각 묶음이 GET 폼이고 버튼(aria-pressed)이 값을 보낸다.
// 쓰기 경로가 아니다(GET, 서버 액션 없음). 자바스크립트 없이도 키보드로 쓸 수 있고 새로 고침·뒤로 가기에 상태가 남는다.
// 겉모양: "정렬" 분할 단추(활성은 떠 있는 흰 칸) + 방향 단추(아이콘 + 글자), 그 아래 "분류" 알약 줄. 모바일은 누르는 영역 44px 이상.
const segment = (on: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-[7px] px-3 text-sm font-semibold transition-colors sm:min-h-8",
    on ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
  );
const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-semibold transition-colors sm:min-h-8",
    on ? "border-transparent bg-btn text-btn-ink" : "border-line-strong bg-surface text-ink hover:bg-bg-alt",
  );
const fieldLabel = "w-8 shrink-0 text-xs font-semibold text-muted";

function Hidden({ values }: { values: Record<string, string | null | undefined> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
    </>
  );
}

export function ListControls({
  action,
  prefix = "",
  sorts,
  query,
  showDir = true,
  categories,
  keep = {},
  label,
}: {
  /** 폼이 보낼 주소 (경로 + #목록 위치) */
  action: string;
  prefix?: string;
  sorts: { key: string; label: string }[];
  query: { sort: string; dir: "asc" | "desc"; cat: string | null };
  showDir?: boolean;
  categories: { key: string; label: string }[];
  /** 같은 화면의 다른 목록 상태 (보존용) */
  keep?: Record<string, string>;
  label: string;
}) {
  const p = prefix;
  const asc = query.dir === "asc";
  return (
    <div className="flex flex-col gap-2.5 border-b border-line pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className={fieldLabel}>
          정렬
        </span>
        <form method="get" action={action} className="inline-flex">
          <Hidden values={{ ...keep, [`${p}cat`]: query.cat }} />
          <div role="group" aria-label={`${label} 정렬 기준`} className="inline-flex gap-0.5 rounded-md bg-bg-alt p-0.5">
            {sorts.map((s) => (
              <button key={s.key} type="submit" name={`${p}sort`} value={s.key} aria-pressed={query.sort === s.key} className={segment(query.sort === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </form>
        {showDir ? (
          <form method="get" action={action} className="ml-auto">
            <Hidden values={{ ...keep, [`${p}sort`]: query.sort, [`${p}cat`]: query.cat }} />
            <button
              type="submit"
              name={`${p}dir`}
              value={asc ? "desc" : "asc"}
              aria-pressed={query.dir === "desc"}
              aria-label={`정렬 방향: 지금 ${asc ? "오름차순" : "내림차순"}, 눌러서 바꾸기`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-bg-alt sm:min-h-9"
            >
              {asc ? (
                <ArrowUpNarrowWide aria-hidden="true" className="size-4 text-muted" />
              ) : (
                <ArrowDownWideNarrow aria-hidden="true" className="size-4 text-muted" />
              )}
              {asc ? "오름차순" : "내림차순"}
            </button>
          </form>
        ) : null}
      </div>
      {categories.length > 0 ? (
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={cn(fieldLabel, "pt-3 sm:pt-1.5")}>
            분류
          </span>
          <form method="get" action={action} className="min-w-0 flex-1">
            <Hidden values={{ ...keep, [`${p}sort`]: query.sort, [`${p}dir`]: query.dir }} />
            <div role="group" aria-label={`${label} 분류 필터`} className="flex flex-wrap gap-1.5">
              <button type="submit" name={`${p}cat`} value="" aria-pressed={query.cat === null} className={chip(query.cat === null)}>
                전체
              </button>
              {categories.map((c) => (
                <button key={c.key} type="submit" name={`${p}cat`} value={c.key} aria-pressed={query.cat === c.key} className={chip(query.cat === c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
