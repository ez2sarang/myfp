import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { CTA, FEATURES, SECURITY, STEPS } from "./content";

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="wrap scroll-mt-20 py-16">
      <h2 id="features-title" className="text-3xl">
        필요한 것만, 정확하게
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <article key={f.title} className="rounded-lg border border-line bg-surface p-6">
            <h3 className="text-lg">{f.title}</h3>
            <p className="mt-2 text-muted">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function How() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 bg-bg-alt py-16">
      <div className="wrap">
        <h2 id="how-title" className="text-3xl">
          작동 방식
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-line bg-surface p-6">
              <span className="num text-sm font-bold text-brand">0{i + 1}</span>
              <h3 className="mt-1 text-lg">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Security() {
  return (
    <section id="security" aria-labelledby="security-title" className="wrap scroll-mt-20 py-16">
      <h2 id="security-title" className="text-3xl">
        보안과 프라이버시
      </h2>
      <p className="mt-2 max-w-2xl text-muted">재무 정보는 민감합니다. myfp 는 꼭 필요한 정보만 저장하고, 공유는 읽기 전용으로만 합니다.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECURITY.map((s) => (
          <article key={s.title} className="rounded-lg border border-line bg-surface p-5">
            <h3 className="text-base">{s.title}</h3>
            <p className="mt-2 text-sm text-muted">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StartCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-band py-16 text-band-ink">
      <div className="wrap flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="cta-title" className="text-3xl">
            {CTA.title}
          </h2>
          <p className="mt-2 text-band-muted">{CTA.body}</p>
        </div>
        <Link href={CTA.action.href} className={buttonClass("primary", "md")}>
          {CTA.action.label}
        </Link>
      </div>
    </section>
  );
}
