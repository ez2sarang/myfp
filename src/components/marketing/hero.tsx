import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { HERO, PROOF } from "./content";
import { ProductPreview } from "./product-preview";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden="true" className="bg-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[52rem]" />
      <div className="wrap flex flex-col items-center pb-16 pt-14 text-center sm:pb-24 sm:pt-24">
        <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-medium text-muted shadow-card backdrop-blur">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
          {HERO.eyebrow}
        </p>
        <h1
          id="hero-title"
          className="rise rise-2 mt-6 whitespace-pre-line text-[2.35rem] leading-[1.12] tracking-[-0.035em] sm:text-6xl lg:text-[4.25rem]"
        >
          {HERO.title}
        </h1>
        <p className="rise rise-3 mt-6 max-w-2xl text-base text-muted sm:text-lg">{HERO.lead}</p>
        <div className="rise rise-3 mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Link href={HERO.primaryCta.href} className={buttonClass("primary", "lg")}>
            {HERO.primaryCta.label}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <a href={HERO.secondaryCta.href} className={buttonClass("secondary", "lg")}>
            {HERO.secondaryCta.label}
          </a>
        </div>
        <ul className="rise rise-4 mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted">
          {HERO.trust.map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Check aria-hidden="true" className="size-4 text-accent-text" />
              {t}
            </li>
          ))}
        </ul>

        <div className="rise rise-4 relative mt-14 w-full max-w-5xl sm:mt-20">
          <div aria-hidden="true" className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2rem] bg-brand-soft blur-3xl" />
          <ProductPreview />
        </div>

        <dl className="mt-14 grid w-full max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:mt-20 lg:grid-cols-4">
          {PROOF.map((p) => (
            <div key={p.label} className="flex flex-col gap-1 bg-surface px-5 py-5 text-left">
              <dt className="order-2 text-sm text-muted">{p.label}</dt>
              <dd className="num order-1 text-2xl font-semibold tracking-tight">{p.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
