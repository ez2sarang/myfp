import type { ReactNode } from "react";
import type { Block, Inline } from "@/lib/guide/markdown";

// 파싱한 블록을 React 로 그린다(서버 컴포넌트). 모든 글자는 React 텍스트로 넣어 이스케이프되고, 원시 HTML 을 넣는 경로가 없다.
// 외부 링크는 같은 탭에서 열고 rel="noopener noreferrer nofollow" 를 붙인다. 표는 가로 스크롤 영역에 넣어 좁은 화면에서 문서 폭이 늘지 않게 한다.

function InlineNodes({ nodes }: { nodes: readonly Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === "text") return n.text;
        if (n.type === "strong") return <strong key={i}><InlineNodes nodes={n.children} /></strong>;
        if (n.type === "em") return <em key={i}><InlineNodes nodes={n.children} /></em>;
        return (
          <a key={i} href={n.href} rel="noopener noreferrer nofollow">
            <InlineNodes nodes={n.children} />
          </a>
        );
      })}
    </>
  );
}

export function headingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function BlockNode({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h2" : "h3";
      return (
        <Tag id={headingId(block.text)}>
          <InlineNodes nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineNodes nodes={block.children} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineNodes nodes={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "checklist":
      return (
        <ul className="guide-checklist">
          {block.items.map((item, i) => (
            <li key={i}>
              <span aria-hidden="true" className="guide-checkbox" />
              <span>
                <InlineNodes nodes={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="guide-table" role="region" aria-label="표" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} scope="col">
                    <InlineNodes nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <InlineNodes nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr />;
  }
}

/** 블록 목록을 그린다. 중간에 끼워 넣을 요소(광고 등)는 insertBefore[블록 순번] 으로 받는다. */
export function MarkdownBlocks({ blocks, insertBefore = {} }: { blocks: readonly Block[]; insertBefore?: Record<number, ReactNode> }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockSlot key={i} extra={insertBefore[i]} block={b} />
      ))}
    </>
  );
}

function BlockSlot({ block, extra }: { block: Block; extra: ReactNode }) {
  return (
    <>
      {extra ?? null}
      <BlockNode block={block} />
    </>
  );
}
