import Link from "next/link";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ChartColumnStacked,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  KeyRound,
  Link2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CTA, DEMO_ITEMS, DEMO_LOAN_END_INDEX, DEMO_MONTHS, DEMO_SUMMARY, FAQ, FEATURES, HOW_NOTES, SECURITY, SHARE, SIGNED_IN, STEPS } from "./content";
import { SessionLink } from "./session-link";

// 소개 페이지 섹션들. 그림은 모두 CSS·SVG 로 만든 장식(aria-hidden)이고, 숫자는 content.ts 의 가상 예시다.

function SectionHead({ id, eyebrow, title, lead, center }: { id: string; eyebrow: string; title: string; lead?: string; center?: boolean }) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", center && "mx-auto items-center text-center")}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={id} className="text-3xl leading-tight tracking-[-0.03em] sm:text-[2.6rem]">
        {title}
      </h2>
      {lead ? <p className="text-base text-muted sm:text-lg">{lead}</p> : null}
    </div>
  );
}

function BentoCell({
  icon: Icon,
  title,
  body,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className={cn("group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}>
      {children ? (
        <div aria-hidden="true" className="relative min-h-40 border-b border-line bg-surface-2 p-5">
          {children}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-5 sm:p-6">
        <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-brand">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <h3 className="mt-2 text-lg tracking-tight">{title}</h3>
        <p className="text-[0.95rem] text-muted">{body}</p>
      </div>
    </article>
  );
}

const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
// 12개월 막대는 고정지출만으로 그린다(예정·일회성은 달마다 달라서 장식에서 뺀다)
const total = DEMO_ITEMS.filter((i) => !i.planned).reduce((s, i) => s + i.amount, 0);
const loan = DEMO_ITEMS.find((i) => i.category === "대출 상환")?.amount ?? 0;

function ProjectionArt() {
  return (
    <div className="flex h-36 items-end gap-1.5 sm:gap-2">
      {DEMO_MONTHS.map((m, idx) => {
        const amount = idx > DEMO_LOAN_END_INDEX ? total - loan : total;
        const h = (amount / total) * 100;
        const loanShare = idx > DEMO_LOAN_END_INDEX ? 0 : (loan / total) * 100;
        return (
          <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex w-full flex-col overflow-hidden rounded-t-[5px]" style={{ height: `${h}%` }}>
              <span className="w-full flex-1" style={{ background: "var(--chart-1)", opacity: 0.85 }} />
              <span className="w-full" style={{ height: `${(loanShare / h) * 100}%`, background: "var(--chart-2)" }} />
            </div>
            <span className="num text-[0.6rem] text-muted">{m}</span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryArt() {
  const rows = [
    { label: "이 달 지출 합계", value: won(DEMO_SUMMARY.monthlyTotal), ratio: 1 },
    { label: "이번 달 남은 납부액", value: won(DEMO_SUMMARY.remaining), ratio: DEMO_SUMMARY.remaining / DEMO_SUMMARY.monthlyTotal },
  ];
  return (
    <div className="grid h-full gap-3 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div key={r.label} className={cn("rounded-lg border border-line bg-surface p-4", i === 0 && "border-t-2 border-t-brand")}>
          <p className="text-xs text-muted">{r.label}</p>
          <p className="num mt-1 text-2xl font-semibold tracking-tight">{r.value}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-alt">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(r.ratio * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PlannedArt() {
  const rows = [
    { name: "노트북 할부", badge: "예정 3/10회", amount: 150_000 },
    { name: "노트북 할부", badge: "예정 4/10회", amount: 150_000, next: true },
    { name: "자동차세", badge: "예정·일회성", amount: 120_000, next: true },
  ];
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2 text-sm">
          <span className="num w-10 shrink-0 text-[0.7rem] text-muted">{r.next ? "다음 달" : "이번 달"}</span>
          <span className="flex-1 truncate">{r.name}</span>
          <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[0.65rem] font-semibold text-brand">{r.badge}</span>
          <span className="num font-medium">{won(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function MonthArt() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface">
          <ChevronLeft className="size-4" />
        </span>
        <span className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-center font-semibold">10월 (이번 달)</span>
        <span className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface">
          <ChevronRight className="size-4" />
        </span>
      </div>
      <div className="flex gap-3 border-b border-line text-xs font-semibold">
        {["이번 달", "예정지출", "내역"].map((t, i) => (
          <span key={t} className={cn("-mb-px border-b-2 pb-1.5", i === 2 ? "border-brand text-ink" : "border-transparent text-muted")}>
            {t}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-1.5 text-xs">
        {[
          { m: "9월", v: 999_500 },
          { m: "8월", v: 985_000 },
        ].map((r) => (
          <li key={r.m} className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-1.5">
            <span className="font-medium">{r.m}</span>
            <span className="num text-muted">합계 {won(r.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HouseholdArt() {
  const members = [
    { tag: "나", amount: 640_000, color: "var(--chart-1)" },
    { tag: "가족", amount: 360_000, color: "var(--chart-2)" },
  ];
  const sum = members.reduce((s, m) => s + m.amount, 0);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">합산 월 고정지출</span>
        <span className="num text-lg font-semibold tracking-tight">{won(sum)}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {members.map((m) => (
          <span key={m.tag} style={{ width: `${(m.amount / sum) * 100}%`, background: m.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {members.map((m) => (
          <span key={m.tag} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1">
            <span className="size-2 rounded-full" style={{ background: m.color }} />
            {m.tag}
          </span>
        ))}
        <span className="inline-flex items-center rounded-full border border-dashed border-line-strong px-2.5 py-1 text-muted">나만 보기 항목 제외</span>
      </div>
    </div>
  );
}

function SortArt() {
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit rounded-md border border-line bg-surface p-0.5 text-xs font-semibold">
        {["날짜순", "금액순", "이름순", "분류순"].map((l, i) => (
          <span key={l} className={cn("rounded-[7px] px-2.5 py-1.5", i === 1 ? "bg-ink text-bg" : "text-muted")}>
            {l}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["전체", "주거", "대출 상환", "보험", "구독"].map((c, i) => (
          <span key={c} className={cn("rounded-full border px-2.5 py-1 text-[0.7rem]", i === 0 ? "border-transparent bg-brand text-brand-ink" : "border-line bg-surface text-muted")}>
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrendArt() {
  return (
    <svg viewBox="0 0 240 110" className="h-32 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 88 L40 80 L80 74 L120 60 L160 52 L200 38 L240 26 L240 110 L0 110 Z" fill="url(#trend-fill)" />
      <path d="M0 88 L40 80 L80 74 L120 60 L160 52 L200 38 L240 26" fill="none" stroke="var(--chart-1)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ShareArt() {
  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
        <Link2 className="size-3.5 text-brand" />
        <span className="num truncate text-muted">myfp.pineai.dev/s/••••••••</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full border border-line bg-surface px-2.5 py-1">그때의 이번 달</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1">30일 후 만료</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1">읽기 전용</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1">금액 숨김 선택</span>
      </div>
    </div>
  );
}

function DataArt() {
  return (
    <div className="flex flex-col gap-2 text-xs">
      {[
        { icon: Download, label: "고정지출 CSV" },
        { icon: Download, label: "자산·부채 CSV" },
        { icon: Trash2, label: "계정 삭제" },
      ].map(({ icon: I, label }) => (
        <span key={label} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
          <I className="size-3.5 text-muted" />
          {label}
        </span>
      ))}
    </div>
  );
}

export function Features() {
  const f = FEATURES.items;
  return (
    <section id="features" aria-labelledby="features-title" className="wrap scroll-mt-20 py-20 sm:py-28">
      <SectionHead id="features-title" eyebrow="기능" title={FEATURES.title} lead={FEATURES.lead} />
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <BentoCell icon={Wallet} title={f.summary.title} body={f.summary.body} className="lg:col-span-2">
          <SummaryArt />
        </BentoCell>
        <BentoCell icon={CalendarRange} title={f.month.title} body={f.month.body}>
          <MonthArt />
        </BentoCell>
        <BentoCell icon={CalendarPlus} title={f.planned.title} body={f.planned.body}>
          <PlannedArt />
        </BentoCell>
        <BentoCell icon={ChartColumnStacked} title={f.projection.title} body={f.projection.body} className="lg:col-span-2">
          <ProjectionArt />
        </BentoCell>
        <BentoCell icon={ArrowDownWideNarrow} title={f.sort.title} body={f.sort.body}>
          <SortArt />
        </BentoCell>
        <BentoCell icon={TrendingUp} title={f.debt.title} body={f.debt.body}>
          <TrendArt />
        </BentoCell>
        <BentoCell icon={Users} title={f.household.title} body={f.household.body}>
          <HouseholdArt />
        </BentoCell>
        <BentoCell icon={Link2} title={f.share.title} body={f.share.body} className="lg:col-span-2">
          <ShareArt />
        </BentoCell>
        <BentoCell icon={ShieldCheck} title={f.data.title} body={f.data.body}>
          <DataArt />
        </BentoCell>
      </div>
    </section>
  );
}

export function How() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-y border-line bg-surface-2 py-20 sm:py-28">
      <div className="wrap">
        <SectionHead id="how-title" eyebrow="작동 방식" title="5분이면 이번 달이 정리됩니다" lead="입력은 한 번, 계산은 매일. 오늘 날짜를 기준으로 합계와 일정이 다시 계산됩니다." />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 bg-surface p-6">
              <span className="num font-mono text-xs font-medium text-brand">0{i + 1}</span>
              <h3 className="text-lg tracking-tight">{s.title}</h3>
              <p className="text-[0.95rem] text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <ul className="mt-8 grid gap-3 text-sm text-muted md:grid-cols-2">
          {HOW_NOTES.map((n) => (
            <li key={n} className="flex gap-2.5">
              <Plus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const SECURITY_ICONS: LucideIcon[] = [UserCheck, Fingerprint, Lock, Globe, KeyRound, Trash2];

export function Security() {
  return (
    <section id="security" aria-labelledby="security-title" className="wrap scroll-mt-20 overflow-x-clip py-20 sm:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="flex flex-col gap-8">
          <SectionHead id="security-title" eyebrow="공유·함께 보기·보안" title={SHARE.title} lead={SHARE.lead} />
          {SHARE.groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-3">
              <h3 className="text-lg tracking-tight">{g.title}</h3>
              <ul className="flex flex-col gap-3">
                {g.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[0.95rem]">
                    <span aria-hidden="true" className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                      <ArrowRight className="size-3" />
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div aria-hidden="true" className="relative self-center">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand-soft blur-2xl" />
          <div className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold tracking-tight">가족에게 보여 줄 요약</p>
              <span className="rounded-full bg-positive-bg px-2 py-0.5 text-[0.7rem] font-semibold text-positive">사용 중</span>
            </div>
            <p className="mt-1 text-xs text-muted">예시 화면 · 가상 데이터</p>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <dt className="text-xs text-muted">보여 줄 범위</dt>
                <dd className="mt-1 font-medium">대시보드 요약</dd>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <dt className="text-xs text-muted">보여 줄 달</dt>
                <dd className="mt-1 font-medium">그때의 이번 달</dd>
              </div>
            </dl>
            <ul className="mt-4 flex flex-col divide-y divide-line rounded-lg border border-line text-sm">
              <li className="flex items-center gap-3 px-3 py-2.5">
                <Eye className="size-4 text-muted" />
                <span className="flex-1">금액 보이기</span>
                <span className="h-5 w-9 rounded-full bg-btn p-0.5">
                  <span className="block size-4 translate-x-4 rounded-full bg-btn-ink" />
                </span>
              </li>
              <li className="flex items-center gap-3 px-3 py-2.5">
                <EyeOff className="size-4 text-muted" />
                <span className="flex-1">메모·기관명 숨기기</span>
                <span className="h-5 w-9 rounded-full bg-btn p-0.5">
                  <span className="block size-4 translate-x-4 rounded-full bg-btn-ink" />
                </span>
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
              <span>30일 후 만료 · 열람 3회 · 누가 열었는지는 저장하지 않음</span>
              <span className="rounded-md border border-line px-2.5 py-1.5 font-semibold text-danger">폐기</span>
            </div>
          </div>
        </div>
      </div>

      <ul className="mt-16 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {SECURITY.map((s, i) => {
          const Icon = SECURITY_ICONS[i] ?? ShieldCheck;
          return (
            <li key={s.title} className="flex flex-col gap-2 bg-surface p-6">
              <Icon aria-hidden="true" className="size-5 text-brand" />
              <h3 className="mt-1 text-base tracking-tight">{s.title}</h3>
              <p className="text-sm text-muted">{s.body}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-muted">
        수집 항목·보관 기간·수탁사는{" "}
        <Link href="/privacy" className="font-medium text-brand underline underline-offset-4">
          개인정보 처리방침
        </Link>
        에 정리되어 있습니다.
      </p>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-y border-line bg-surface-2 py-20 sm:py-28">
      <div className="wrap grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionHead id="faq-title" eyebrow="자주 묻는 질문" title="시작하기 전에 궁금한 것들" lead="여기에 없는 내용은 개인정보 처리방침과 이용약관에서 확인할 수 있습니다." />
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
          {FAQ.map((item, i) => (
            <details key={item.q} className="faq group px-5 sm:px-6" open={i === 0}>
              <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 font-semibold tracking-tight">
                <span>{item.q}</span>
                <Plus data-chevron aria-hidden="true" className="size-4 shrink-0 text-muted" />
              </summary>
              <p className="-mt-1 pb-5 text-[0.95rem] text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StartCta() {
  return (
    <section aria-labelledby="cta-title" className="wrap py-20 sm:py-28">
      <div className="relative isolate overflow-hidden rounded-xl bg-band px-6 py-14 text-band-ink ring-1 ring-inset ring-white/10 sm:px-14 sm:py-20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 80% at 85% 0%, rgba(110,140,255,0.35), transparent 70%), radial-gradient(40% 60% at 0% 100%, rgba(52,211,153,0.16), transparent 70%)",
          }}
        />
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 id="cta-title" className="text-3xl leading-tight tracking-[-0.03em] sm:text-[2.6rem]">
            {CTA.title}
          </h2>
          <p className="text-band-muted sm:text-lg">{CTA.body}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <SessionLink
              signedOutHref={CTA.action.href}
              signedOutLabel={CTA.action.label}
              signedInHref={SIGNED_IN.href}
              signedInLabel={SIGNED_IN.cta}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-band-ink px-5 font-semibold tracking-tight text-band transition-opacity hover:opacity-90 sm:min-w-[11.5rem]"
              trailing={<ArrowRight aria-hidden="true" className="size-4" />}
            />
            <a
              href={CTA.secondary.href}
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/20 px-5 font-semibold tracking-tight text-band-ink transition-colors hover:bg-white/10"
            >
              {CTA.secondary.label}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
