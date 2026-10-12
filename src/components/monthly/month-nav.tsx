import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { monthLabel, shiftMonth, type MonthTiming } from "@/lib/finance/occurrences";

const TIMING: Record<MonthTiming, { label: string; tone: "brand" | "neutral" | "info" }> = {
  current: { label: "이번 달", tone: "brand" },
  past: { label: "과거", tone: "neutral" },
  future: { label: "예정", tone: "info" },
};

// 기준 달 이동: ◀ ▶ 링크와 달 고르기(GET 폼, 자바스크립트 없이 동작). 고를 수 있는 달은 서버가 정한 범위뿐이다.
export function MonthNav({
  month,
  timing,
  months,
  current,
  basePath = "/app",
  keep = {},
}: {
  month: string;
  timing: MonthTiming;
  months: readonly string[];
  current: string;
  basePath?: string;
  /** 같은 화면의 다른 상태 (달을 바꿔도 유지) */
  keep?: Record<string, string>;
}) {
  const first = months[0] ?? month;
  const last = months[months.length - 1] ?? month;
  const href = (m: string) => `${basePath}?${new URLSearchParams({ ...keep, month: m }).toString()}`;
  return (
    <nav aria-label="기준 달" className="mb-5 flex flex-wrap items-center gap-2">
      {month > first ? (
        <Link href={href(shiftMonth(month, -1))} className={buttonClass("secondary", "sm", "min-h-11 sm:min-h-9")} aria-label="이전 달">
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span className={buttonClass("secondary", "sm", "pointer-events-none min-h-11 opacity-40 sm:min-h-9")} aria-hidden="true">
          <ChevronLeft className="size-4" />
        </span>
      )}
      <form method="get" action={basePath} className="flex items-center gap-2">
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label htmlFor="month-select" className="sr-only">
          기준 달 고르기
        </label>
        <Select id="month-select" name="month" defaultValue={month} className="min-h-11 sm:min-h-9">
          {[...months].reverse().map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {m === current ? " (이번 달)" : ""}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary", "sm", "min-h-11 sm:min-h-9")}>
          이동
        </button>
      </form>
      {month < last ? (
        <Link href={href(shiftMonth(month, 1))} className={buttonClass("secondary", "sm", "min-h-11 sm:min-h-9")} aria-label="다음 달">
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span className={buttonClass("secondary", "sm", "pointer-events-none min-h-11 opacity-40 sm:min-h-9")} aria-hidden="true">
          <ChevronRight className="size-4" />
        </span>
      )}
      {/* 이번 달이면 제목·고르기 상자에 이미 드러나므로 배지를 생략하고, 과거·예정 달일 때만 붙인다 */}
      {timing !== "current" ? <Badge tone={TIMING[timing].tone}>{TIMING[timing].label}</Badge> : null}
      {month !== current ? (
        <Link href={Object.keys(keep).length > 0 ? `${basePath}?${new URLSearchParams(keep).toString()}` : basePath} className="text-sm font-medium text-brand underline underline-offset-4">
          이번 달로
        </Link>
      ) : null}
    </nav>
  );
}

// 대시보드 탭: 이번 달 | 예정지출 | 내역 (링크, 현재 탭은 aria-current)
export function DashboardTabs({ tab }: { tab: "month" | "planned" | "history" }) {
  const items = [
    { key: "month", label: "이번 달", href: "/app" },
    { key: "planned", label: "예정지출", href: "/app?tab=planned" },
    { key: "history", label: "내역", href: "/app?tab=history" },
  ] as const;
  return (
    <nav aria-label="대시보드 보기" className="mb-5 flex gap-1 border-b border-line">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={tab === t.key ? "page" : undefined}
          className={
            tab === t.key
              ? "-mb-px inline-flex min-h-11 items-center border-b-2 border-brand px-3 text-sm font-semibold text-ink"
              : "-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted hover:text-ink"
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
