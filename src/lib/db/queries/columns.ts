// 마이그레이션이 적용됐는지(열이 있는지) 확인 (서버 전용). 있으면 프로세스가 끝날 때까지 기억하고, 없으면 다음 호출에서 다시 확인한다.
// 0008 의 '나만 보기'(private) 열처럼, 적용 전에도 기존 저장이 깨지지 않게 쓰기를 건너뛸 때 쓴다.
import type { Db } from "../types.ts";

const known = new Set<string>();

export async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  if (known.has(key)) return true;
  const res = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = 'myfp' AND table_name = $1 AND column_name = $2", [table, column]);
  if (res.rows.length > 0) known.add(key);
  return res.rows.length > 0;
}
