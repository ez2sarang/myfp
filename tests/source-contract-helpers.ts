// 소스 계약 시험용 도구: 프레임워크(next/headers, 서버 컴포넌트) 의존이라 직접 실행할 수 없는 배선을 소스 텍스트로 확인한다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "..");

export function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** 주석을 지운 소스 텍스트 (주석 처리한 가드 호출이 계약을 만족시키지 못하게 한다). */
export function readCode(relative: string): string {
  const raw = readFileSync(path.join(root, relative), "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, "$1");
}

/** src/app 아래 page.tsx 의 root 기준 상대 경로 목록 (정렬). */
export function pageFiles(group: string): string[] {
  const base = path.join(root, "src", "app", group);
  return walk(base)
    .filter((f) => f.endsWith(`${path.sep}page.tsx`))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .sort();
}

/** `export default` 이후 첫 return 이전에 needle(정규식)이 나오는지. 가드가 조건문 안이나 return 뒤로 밀리면 거짓이 된다. */
export function guardsBeforeFirstReturn(code: string, needle: RegExp): boolean {
  const start = code.search(/export\s+default\s+(async\s+)?function/);
  if (start === -1) return false;
  const body = code.slice(start);
  const guard = body.search(needle);
  if (guard === -1) return false;
  const ret = body.search(/\breturn\b/);
  return ret === -1 || guard < ret;
}
