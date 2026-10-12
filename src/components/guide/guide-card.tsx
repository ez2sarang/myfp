import Link from "next/link";
import type { GuideMeta } from "@/lib/guide/frontmatter";

// 가이드 글 카드 (목록·관련 글 공용)
export function GuideCard({ meta, headingLevel = "h3" }: { meta: GuideMeta; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong">
      <Heading className="text-lg leading-snug tracking-tight">
        <Link href={`/guide/${meta.slug}`} className="hover:text-brand">
          {meta.title}
        </Link>
      </Heading>
      <p className="text-sm leading-relaxed text-muted">{meta.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {meta.tags.slice(0, 3).map((t) => (
          <span key={t} className="rounded-full bg-bg-alt px-2.5 py-0.5 text-xs text-muted">
            {t}
          </span>
        ))}
        <span className="num ml-auto text-xs text-muted">읽는 시간 {meta.readingMinutes}분</span>
      </div>
    </article>
  );
}
