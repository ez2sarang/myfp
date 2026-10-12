// 마이그레이션 실행의 공통 부분 (순수 모듈 + 주입된 Db). scripts/migrate.mjs 와 DB 시험이 함께 쓴다.
import type { Db } from "./types.ts";

const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,40}$/;
const PLACEHOLDER = "__SCHEMA__";

export function assertSchemaName(schema: string): string {
  if (!SCHEMA_RE.test(schema)) throw new Error(`스키마 이름이 올바르지 않습니다: ${JSON.stringify(schema)}`);
  return schema;
}

/** 플레이스홀더를 검증된 스키마 이름으로 바꾼다. 스키마 이름은 소문자 식별자만 허용하므로 따옴표 없이 안전하다. */
export function renderSql(sql: string, schema: string): string {
  const safe = assertSchemaName(schema);
  return sql.split(PLACEHOLDER).join(safe);
}

export function hasPlaceholder(sql: string): boolean {
  return sql.includes(PLACEHOLDER);
}

/** 스키마가 없으면 만든다 (이미 있으면 CREATE 권한이 없어도 통과한다). */
export async function ensureSchema(db: Db, schema: string): Promise<void> {
  const safe = assertSchemaName(schema);
  const found = await db.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [safe]);
  if (found.rowCount === 0) await db.query(`CREATE SCHEMA ${safe}`);
}

/** 적용 이력 테이블 (마이그레이션 SQL 과 별개로 러너가 만든다). */
export async function ensureHistoryTable(db: Db, schema: string): Promise<void> {
  const safe = assertSchemaName(schema);
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${safe}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
}

export async function appliedMigrations(db: Db, schema: string): Promise<Set<string>> {
  const safe = assertSchemaName(schema);
  const res = await db.query<{ name: string }>(`SELECT name FROM ${safe}.schema_migrations`);
  return new Set(res.rows.map((r) => r.name));
}

export async function applyMigration(db: Db, schema: string, name: string, sql: string): Promise<void> {
  const safe = assertSchemaName(schema);
  await db.query(renderSql(sql, safe));
  await db.query(`INSERT INTO ${safe}.schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
}
