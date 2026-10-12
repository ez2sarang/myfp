import { cn } from "@/lib/utils";

// 세부 목록의 정렬·방향·분류 컨트롤. 상태는 URL 쿼리로만 둔다: 각 묶음이 GET 폼이고 버튼(aria-pressed)이 값을 보낸다.
// 쓰기 경로가 아니다(GET, 서버 액션 없음). 자바스크립트 없이도 키보드로 쓸 수 있고 새로 고침·뒤로 가기에 상태가 남는다.
const segment = (on: boolean) =>
  cn(
    "min-h-8 px-3 text-sm font-semibold transition-colors first:rounded-l-md last:rounded-r-md",
    on ? "bg-ink text-bg" : "bg-surface text-muted hover:bg-bg-alt hover:text-ink",
  );
const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
    on ? "border-transparent bg-btn text-btn-ink" : "border-line-strong bg-surface text-ink hover:bg-bg-alt",
  );

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
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form method="get" action={action} className="inline-flex">
          <Hidden values={{ ...keep, [`${p}cat`]: query.cat }} />
          <div role="group" aria-label={`${label} 정렬 기준`} className="inline-flex overflow-hidden rounded-md border border-line-strong">
            {sorts.map((s) => (
              <button key={s.key} type="submit" name={`${p}sort`} value={s.key} aria-pressed={query.sort === s.key} className={segment(query.sort === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </form>
        {showDir ? (
          <form method="get" action={action}>
            <Hidden values={{ ...keep, [`${p}sort`]: query.sort, [`${p}cat`]: query.cat }} />
            <button
              type="submit"
              name={`${p}dir`}
              value={query.dir === "asc" ? "desc" : "asc"}
              aria-pressed={query.dir === "desc"}
              aria-label={`정렬 방향: 지금 ${query.dir === "asc" ? "오름차순" : "내림차순"}, 눌러서 바꾸기`}
              className="min-h-8 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-bg-alt"
            >
              {query.dir === "asc" ? "↑ 오름차순" : "↓ 내림차순"}
            </button>
          </form>
        ) : null}
      </div>
      {categories.length > 0 ? (
        <form method="get" action={action}>
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
      ) : null}
    </div>
  );
}
