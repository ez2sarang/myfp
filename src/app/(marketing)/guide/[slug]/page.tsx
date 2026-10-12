import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdScript } from "@/components/ads/ad-script";
import { AdSlot } from "@/components/ads/ad-slot";
import { GuideCard } from "@/components/guide/guide-card";
import { MarkdownBlocks } from "@/components/guide/markdown";
import { MAX_ADS_PER_ARTICLE } from "@/lib/ads/config";
import { getGuide, getGuides } from "@/lib/guide/content";
import type { Block } from "@/lib/guide/markdown";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// 가이드 글 상세 (빌드 때 12편을 정적 생성). 목록에 없는 slug 는 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getGuides().map((g) => ({ slug: g.meta.slug }));
}

type Props = { params: Promise<{ slug: string }> };

const canonicalOf = (slug: string) => `${SITE_URL}/guide/${slug}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  const { meta } = guide;
  const url = canonicalOf(meta.slug);
  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.tags,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      url,
      title: meta.title,
      description: meta.description,
      publishedTime: meta.date,
      modifiedTime: meta.updated,
      authors: [meta.byline],
      tags: meta.tags,
    },
    twitter: { card: "summary", title: meta.title, description: meta.description },
  };
}

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
};

const isHeading = (b: Block, level: 2, text?: string) => b.type === "heading" && b.level === level && (text === undefined || b.text === text);

/** 광고 위치: 본문 가운데 h2 앞(중간)과 「참고 출처」 앞(아래). 버튼·내비게이션과 떨어진 본문 안에만 둔다. */
function adPositions(blocks: readonly Block[]): number[] {
  const sourcesAt = blocks.findIndex((b) => isHeading(b, 2, "참고 출처"));
  const contentH2 = blocks.flatMap((b, i) => (isHeading(b, 2) && (sourcesAt === -1 || i < sourcesAt) ? [i] : []));
  const positions: number[] = [];
  if (contentH2.length >= 3) positions.push(contentH2[Math.floor(contentH2.length / 2)] as number);
  if (sourcesAt > 0) positions.push(sourcesAt);
  return positions.slice(0, MAX_ADS_PER_ARTICLE);
}

export default async function GuideArticlePage({ params }: Props) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const { meta } = guide;
  const pathname = `/guide/${meta.slug}`;
  const url = canonicalOf(meta.slug);
  // 본문 첫 # 제목은 페이지 제목(h1)과 같으므로 뺀다
  const blocks = guide.blocks[0]?.type === "heading" && guide.blocks[0].level === 1 ? guide.blocks.slice(1) : guide.blocks;
  const ads: Record<number, ReactNode> = {};
  for (const at of adPositions(blocks)) ads[at] = <AdSlot pathname={pathname} />;
  const related = meta.related.map((s) => getGuide(s)?.meta).filter((m) => m !== undefined);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: meta.title,
      description: meta.description,
      datePublished: meta.date,
      dateModified: meta.updated,
      inLanguage: "ko",
      keywords: meta.tags.join(", "),
      author: { "@type": "Organization", name: meta.byline },
      publisher: { "@type": "Organization", name: meta.byline },
      mainEntityOfPage: url,
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "가이드", item: `${SITE_URL}/guide` },
        { "@type": "ListItem", position: 3, name: meta.title, item: url },
      ],
    },
  ];

  return (
    <article className="wrap max-w-3xl py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <AdScript pathname={pathname} />
      <nav aria-label="이동 경로" className="text-sm text-muted">
        <Link href="/guide" className="hover:text-ink">
          가이드
        </Link>
      </nav>
      <header className="mt-4">
        <h1 className="text-[1.9rem] leading-tight tracking-[-0.03em] sm:text-[2.5rem]">{meta.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">{meta.description}</p>
        <dl className="num mt-6 flex flex-wrap gap-x-5 gap-y-1 border-y border-line py-3 text-sm text-muted">
          <div className="flex gap-1.5">
            <dt>작성</dt>
            <dd>
              <time dateTime={meta.date}>{formatDate(meta.date)}</time>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>확인</dt>
            <dd>
              <time dateTime={meta.updated}>{formatDate(meta.updated)}</time>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="sr-only">작성자</dt>
            <dd>{meta.byline}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="sr-only">읽는 시간</dt>
            <dd>읽는 시간 {meta.readingMinutes}분</dd>
          </div>
        </dl>
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="태그">
          {meta.tags.map((t) => (
            <li key={t} className="rounded-full bg-bg-alt px-2.5 py-0.5 text-xs text-muted">
              {t}
            </li>
          ))}
        </ul>
      </header>

      <div className="guide-prose mt-10">
        <MarkdownBlocks blocks={blocks} insertBefore={ads} />
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-16 border-t border-line pt-10">
          <h2 id="related-title" className="text-xl tracking-tight">
            함께 읽으면 좋은 글
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {related.map((m) => (
              <li key={m.slug}>
                <GuideCard meta={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-12 rounded-xl border border-line bg-surface-2 p-5 text-sm leading-relaxed text-muted">
        매달 나가는 고정지출과 자산·부채를 한 화면에 정리하고 싶다면{" "}
        <Link href="/" className="font-semibold text-brand underline underline-offset-4">
          {SITE_NAME} 살펴보기
        </Link>
      </p>
    </article>
  );
}
