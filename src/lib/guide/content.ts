// 가이드 글 불러오기 (서버 전용, 빌드 때 실행). content/guide/<slug>.md 를 읽어 프론트매터를 검증하고 본문을 블록으로 바꾼다.
// 형식 오류·없는 관련 글 slug·주제 그룹 누락은 예외로 빌드를 멈춘다.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { GuideFormatError, parseGuideFile, type GuideMeta } from "./frontmatter.ts";
import { parseMarkdown, type Block } from "./markdown.ts";

export interface Guide {
  meta: GuideMeta;
  blocks: Block[];
}

/** 목록 화면의 주제 그룹. 순서가 곧 화면 순서다. */
export const GUIDE_GROUPS = [
  { key: "basics", title: "고정지출 기본", slugs: ["fixed-expenses-ratio", "cut-fixed-expenses-checklist"] },
  { key: "loans", title: "대출·이자", slugs: ["loan-repayment-methods", "prepayment-fee", "interest-rate-cut-request", "refinancing-checklist"] },
  { key: "bills", title: "보험·구독·통신·자동차", slugs: ["insurance-premium-review", "find-hidden-subscriptions", "cut-phone-bills", "car-fixed-costs"] },
  { key: "assets", title: "자산·공유", slugs: ["net-worth-calculation", "share-finances-with-family-safely"] },
] as const;

export const GUIDE_DIR = path.join(process.cwd(), "content", "guide");

/** 디렉터리의 모든 글을 읽어 검증한다 (그룹 순서대로). */
export function loadGuides(dir: string = GUIDE_DIR): Guide[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const bySlug = new Map<string, Guide>();
  for (const file of files) {
    const fileSlug = file.slice(0, -3);
    const { meta, body } = parseGuideFile(readFileSync(path.join(dir, file), "utf8"), fileSlug);
    bySlug.set(meta.slug, { meta, blocks: parseMarkdown(body) });
  }
  const ordered = GUIDE_GROUPS.flatMap((g) => g.slugs as readonly string[]);
  for (const slug of bySlug.keys()) {
    if (!ordered.includes(slug)) throw new GuideFormatError(`${slug}: 주제 그룹(GUIDE_GROUPS)에 없습니다.`);
  }
  for (const slug of ordered) {
    if (!bySlug.has(slug)) throw new GuideFormatError(`${slug}: 그룹에는 있으나 글 파일이 없습니다.`);
  }
  for (const guide of bySlug.values()) {
    for (const r of guide.meta.related) {
      if (!bySlug.has(r)) throw new GuideFormatError(`${guide.meta.slug}: 관련 글 ${r} 이 없습니다.`);
    }
  }
  return ordered.map((slug) => bySlug.get(slug) as Guide);
}

let cache: Guide[] | null = null;

/** 빌드·서버 렌더 중 한 번만 읽는다. */
export function getGuides(): Guide[] {
  cache ??= loadGuides();
  return cache;
}

export function getGuide(slug: string): Guide | null {
  return getGuides().find((g) => g.meta.slug === slug) ?? null;
}

/** 사이트맵 항목: 가이드 목록 + 글 전체. lastModified 는 프론트매터 updated(목록은 가장 최근 값). */
export function guideSitemapEntries(siteUrl: string, guides: readonly Guide[] = getGuides()): MetadataRoute.Sitemap {
  const latest = guides.reduce((max, g) => (g.meta.updated > max ? g.meta.updated : max), "");
  return [
    { url: `${siteUrl}/guide`, lastModified: latest, changeFrequency: "weekly", priority: 0.8 },
    ...guides.map((g) => ({ url: `${siteUrl}/guide/${g.meta.slug}`, lastModified: g.meta.updated, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
