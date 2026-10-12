import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { formatKRW } from "@/lib/finance/format";
import { DEMO, HERO } from "./content";

export function Hero() {
  return (
    <section className="wrap grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-5">
        <span className="text-sm font-semibold uppercase tracking-wider text-brand">{HERO.eyebrow}</span>
        <h1 className="text-4xl sm:text-5xl">{HERO.title}</h1>
        <p className="max-w-xl text-lg text-muted">{HERO.lead}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={HERO.primaryCta.href} className={buttonClass("primary", "md")}>
            {HERO.primaryCta.label}
          </Link>
          <a href={HERO.secondaryCta.href} className={buttonClass("secondary", "md")}>
            {HERO.secondaryCta.label}
          </a>
        </div>
      </div>
      <figure className="rounded-lg border border-line bg-surface p-5 shadow-sm" aria-label="대시보드 예시 (가짜 데이터)">
        <figcaption className="mb-3 text-xs text-muted">예시 화면 · 가짜 데이터</figcaption>
        <p className="text-sm text-muted">이번 달 고정지출</p>
        <p className="num text-3xl font-bold">{formatKRW(DEMO.monthlyTotal)}</p>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
          {DEMO.categories.map((c, i) => (
            <span key={c.label} style={{ width: `${c.share}%`, background: `var(--chart-${i + 1})` }} />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {DEMO.categories.map((c) => (
            <li key={c.label}>
              {c.label} {c.share}%
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm font-semibold">다가오는 납부</p>
        <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
          {DEMO.upcoming.map((u) => (
            <li key={u.name} className="flex justify-between py-2">
              <span>
                {u.name} <span className="text-muted">· {u.day}</span>
              </span>
              <span className="num font-semibold">{formatKRW(u.amount)}</span>
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
