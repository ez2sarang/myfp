import type { Metadata } from "next";
import { GuideCard } from "@/components/guide/guide-card";
import { GUIDE_GROUPS, getGuides } from "@/lib/guide/content";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = "고정지출·대출·자산 관리 가이드";
const DESCRIPTION = "고정지출 비율 계산부터 대출 상환 방식, 보험·구독·통신비 점검, 순자산 정리와 가족 공유까지 — 매달 나가는 돈을 점검하는 실용 가이드 12편.";
const CANONICAL = `${SITE_URL}/guide`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR", url: CANONICAL, title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

// 가이드 목록 (빌드 때 정적 생성). 글은 content/guide/*.md 에서 읽고, 주제 그룹 순서대로 보여 준다.
export default function GuideIndexPage() {
  const bySlug = new Map(getGuides().map((g) => [g.meta.slug, g.meta]));
  return (
    <div className="wrap py-14 sm:py-20">
      <header className="max-w-3xl">
        <p className="eyebrow">가이드</p>
        <h1 className="mt-3 text-3xl tracking-[-0.03em] sm:text-[2.6rem]">{TITLE}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          쓰기도 전에 빠져나가기로 정해진 돈부터 알아야 예산이 섭니다. 고정지출을 분류하고 비율을 계산하는 기본에서 시작해, 대출 이자·보험·구독·통신·자동차
          비용을 차례로 점검하고, 자산과 부채를 정리해 가족과 안전하게 나누는 방법까지 순서대로 정리했습니다. 모든 예시 금액은 이해를 돕기 위한 가상 수치입니다.
        </p>
      </header>
      <div className="mt-14 flex flex-col gap-14">
        {GUIDE_GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={`group-${group.key}`}>
            <h2 id={`group-${group.key}`} className="text-xl tracking-tight">
              {group.title}
            </h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {group.slugs.map((slug) => {
                const meta = bySlug.get(slug);
                return meta ? (
                  <li key={slug}>
                    <GuideCard meta={meta} />
                  </li>
                ) : null;
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
