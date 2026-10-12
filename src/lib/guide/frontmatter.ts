// 가이드 글 프론트매터 파서 (순수 모듈, 새 패키지 없음). 초안이 쓰는 YAML 부분집합만 엄격하게 받는다:
//   key: "문자열" | key: 날짜(YYYY-MM-DD) | key: 정수 | key: ["a", "b"] | sources: 목록(- title: "…" / url: "…")
// 필수 키가 없거나 형식이 다르면 예외를 던져 빌드가 실패하게 한다(조용히 넘어가지 않는다).
import { safeHref } from "./markdown.ts";

export interface GuideSource {
  title: string;
  url: string;
}

export interface GuideMeta {
  title: string;
  description: string;
  slug: string;
  date: string;
  updated: string;
  byline: string;
  tags: string[];
  readingMinutes: number;
  sources: GuideSource[];
  related: string[];
}

export class GuideFormatError extends Error {}

export const SLUG_RE = /^[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED = ["title", "description", "slug", "date", "updated", "byline", "tags", "reading_minutes", "sources"] as const;

function unquote(raw: string, where: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) throw new GuideFormatError(`${where}: 따옴표가 닫히지 않았습니다.`);
    return JSON.parse(v) as string;
  }
  return v;
}

function parseArray(raw: string, where: string): string[] {
  const v = raw.trim();
  if (!v.startsWith("[") || !v.endsWith("]")) throw new GuideFormatError(`${where}: 배열 형식([..])이 아닙니다.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    throw new GuideFormatError(`${where}: 배열을 읽을 수 없습니다.`);
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string" && x.trim().length > 0)) {
    throw new GuideFormatError(`${where}: 문자열 배열이어야 합니다.`);
  }
  return parsed as string[];
}

/** 원문 → { meta, body }. fileSlug 는 파일 이름(확장자 제외)이며 프론트매터 slug 와 같아야 한다. */
export function parseGuideFile(raw: string, fileSlug: string): { meta: GuideMeta; body: string } {
  const where = `content/guide/${fileSlug}.md`;
  const text = raw.replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) throw new GuideFormatError(`${where}: 프론트매터(---)로 시작해야 합니다.`);
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) throw new GuideFormatError(`${where}: 프론트매터가 닫히지 않았습니다.`);
  const lines = text.slice(4, end).split("\n");
  const body = text.slice(end + 5);

  const values = new Map<string, string>();
  const sources: GuideSource[] = [];
  let inSources = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.trim() === "") continue;
    if (inSources && line.startsWith("  - title: ")) {
      const next = lines[i + 1] ?? "";
      if (!next.startsWith("    url: ")) throw new GuideFormatError(`${where}: sources 항목에 url 이 없습니다.`);
      const title = unquote(line.slice("  - title: ".length), where);
      const url = safeHref(unquote(next.slice("    url: ".length), where));
      if (!title || !url) throw new GuideFormatError(`${where}: sources 항목의 title·url 이 올바르지 않습니다.`);
      sources.push({ title, url });
      i += 1;
      continue;
    }
    const m = /^([a-z_]+):(.*)$/.exec(line);
    if (!m) throw new GuideFormatError(`${where}: 해석할 수 없는 줄입니다 — ${JSON.stringify(line.slice(0, 40))}`);
    const key = m[1] as string;
    if (values.has(key) || (key === "sources" && inSources)) throw new GuideFormatError(`${where}: ${key} 가 두 번 나옵니다.`);
    inSources = key === "sources";
    values.set(key, (m[2] as string).trim());
  }

  for (const key of REQUIRED) {
    if (!values.has(key)) throw new GuideFormatError(`${where}: 필수 키 ${key} 가 없습니다.`);
  }
  const str = (key: string): string => {
    const v = unquote(values.get(key) ?? "", `${where} ${key}`);
    if (!v) throw new GuideFormatError(`${where}: ${key} 가 비었습니다.`);
    return v;
  };
  const slug = str("slug");
  if (!SLUG_RE.test(slug)) throw new GuideFormatError(`${where}: slug 형식이 올바르지 않습니다.`);
  if (slug !== fileSlug) throw new GuideFormatError(`${where}: slug(${slug}) 와 파일 이름이 다릅니다.`);
  const date = str("date");
  const updated = str("updated");
  for (const [k, v] of [["date", date], ["updated", updated]] as const) {
    if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new GuideFormatError(`${where}: ${k} 는 YYYY-MM-DD 여야 합니다.`);
  }
  if (updated < date) throw new GuideFormatError(`${where}: updated 가 date 보다 빠릅니다.`);
  const minutes = Number(values.get("reading_minutes"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new GuideFormatError(`${where}: reading_minutes 는 1~60 정수여야 합니다.`);
  if (values.get("sources") !== "" || sources.length === 0) throw new GuideFormatError(`${where}: sources 목록이 비었습니다.`);
  const related = values.has("related") ? parseArray(values.get("related") as string, `${where} related`) : [];
  for (const r of related) if (!SLUG_RE.test(r)) throw new GuideFormatError(`${where}: related 의 slug 형식이 올바르지 않습니다.`);

  return {
    meta: {
      title: str("title"),
      description: str("description"),
      slug,
      date,
      updated,
      byline: str("byline"),
      tags: parseArray(values.get("tags") as string, `${where} tags`),
      readingMinutes: minutes,
      sources,
      related,
    },
    body,
  };
}
