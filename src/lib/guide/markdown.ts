// 가이드 글용 최소 마크다운 파서 (순수 모듈, 새 패키지 없음). 초안이 실제로 쓰는 문법만 지원한다:
//  제목 #~###, 문단, **굵게**, *기울임*, 순서·비순서 목록, 체크박스 목록(- [ ]), 표(|), [텍스트](주소)·본문 속 URL, 구분선(---).
// 원시 HTML 은 해석하지 않는다(그냥 글자로 남고, 렌더러가 React 텍스트로 넣어 이스케이프된다).
// 링크는 http·https 만 허용한다. javascript:·data: 같은 다른 스킴은 링크로 만들지 않고 글자로 둔다.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; children: Inline[]; text: string }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "checklist"; items: Inline[][] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] }
  | { type: "hr" };

/** http(s) 절대 주소만 링크로 허용한다. 공백·제어 문자가 섞이면 거부. */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  // eslint-disable-next-line no-control-regex
  if (value.length === 0 || value.length > 2000 || /[\s\u0000-\u001f\u007f<>"]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
}

// 본문 속 URL: 공백·괄호류 앞에서 끝난다. 끝에 붙은 문장부호는 링크에서 뺀다.
const URL_RE = /https?:\/\/[^\s<>"「」『』()[\]]+/;
const TRAILING = /[.,;:!?'"’”」』)\]]+$/;

/** 한 줄 안의 인라인 문법 해석 */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (rest.startsWith("**")) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (rest.startsWith("*") && rest.length > 2 && rest[1] !== " ") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && src[end - 1] !== " ") {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (rest.startsWith("[")) {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        const href = safeHref(m[2] as string);
        flush();
        if (href) out.push({ type: "link", href, children: parseInline(m[1] as string) });
        else out.push({ type: "text", text: m[1] as string });
        i += m[0].length;
        continue;
      }
    } else if (rest.startsWith("http://") || rest.startsWith("https://")) {
      const m = URL_RE.exec(rest);
      if (m && m.index === 0) {
        const raw = m[0].replace(TRAILING, "");
        const href = safeHref(raw);
        if (href) {
          flush();
          out.push({ type: "link", href, children: [{ type: "text", text: raw }] });
          i += raw.length;
          continue;
        }
      }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

/** 인라인 목록의 글자만 이어 붙인다 (제목 id·메타 설명용) */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes.map((n) => (n.type === "text" ? n.text : inlineText(n.children))).join("");
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isTableDivider = (line: string): boolean => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim());

/** 본문 → 블록 목록 */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const trimmed = line.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const children = parseInline((heading[2] as string).trim());
      blocks.push({ type: "heading", level: (heading[1] as string).length as 1 | 2 | 3, children, text: inlineText(children) });
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }
    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableDivider(lines[i + 1] as string)) {
      const head = splitRow(trimmed).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] as string).trim().startsWith("|")) {
        rows.push(splitRow(lines[i] as string).map(parseInline));
        i += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }
    if (/^- \[[ xX]\] /.test(trimmed)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^- \[[ xX]\] /.test((lines[i] as string).trim())) {
        items.push(parseInline((lines[i] as string).trim().slice(6)));
        i += 1;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }
    if (/^[-*] /.test(trimmed) || /^\d+\. /.test(trimmed)) {
      const ordered = /^\d+\. /.test(trimmed);
      const marker = ordered ? /^\d+\. / : /^[-*] /;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const t = (lines[i] as string).trim();
        if (!marker.test(t) || /^- \[[ xX]\] /.test(t)) break;
        items.push(parseInline(t.replace(marker, "")));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    // 문단: 빈 줄이나 다른 블록 시작 전까지 이어진 줄을 공백 하나로 합친다
    const parts: string[] = [];
    while (i < lines.length) {
      const t = (lines[i] as string).trim();
      if (t === "" || /^#{1,3}\s/.test(t) || /^[-*] /.test(t) || /^\d+\. /.test(t) || /^(-{3,}|\*{3,})$/.test(t) || t.startsWith("|")) break;
      parts.push(t);
      i += 1;
    }
    if (parts.length === 0) {
      // 위 규칙에 걸리지 않은 한 줄(예: 구분자 없는 | 줄)은 문단으로 둔다
      parts.push(trimmed);
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(parts.join(" ")) });
  }
  return blocks;
}
