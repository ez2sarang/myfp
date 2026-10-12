#!/usr/bin/env node
// 마이그레이션 실행기: db/migrations/*.sql 을 이름 순으로 적용한다 (적용 이력은 myfp.schema_migrations).
//
//   node scripts/migrate.mjs [--dry-run]
//
// 연결 문자열은 환경 변수에서만 읽는다 (인자·로그에 남기지 않는다): MIGRATE_DATABASE_URL, 없으면 DATABASE_URL.
// 마이그레이션은 DDL 권한이 있는 소유자 연결로 실행한다. 앱 연결(myfp_app)과 분리하는 것을 권장한다.
// 마이그레이션 SQL 은 스키마를 myfp. 로 직접 명시한다. 다른 스키마는 건드리지 않는다.
// --dry-run: 아무것도 쓰지 않고 적용될 목록만 보여 준다 (연결 정보가 없으면 파일 목록만).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appliedMigrations, applyMigration, ensureHistoryTable, ensureSchema } from "../src/lib/db/migrate-core.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "myfp";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function sslFor(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? undefined : { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const opts = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = path.join(root, "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;

  if (!url) {
    if (!opts.dryRun) throw new Error("MIGRATE_DATABASE_URL 또는 DATABASE_URL 이 필요합니다.");
    console.log(`[dry-run] 연결 정보 없음. 스키마 ${SCHEMA} 에 적용 후보: ${files.join(", ")}`);
    return;
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000, ssl: sslFor(url) });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [SCHEMA]);
    if (opts.dryRun) {
      const applied =
        exists.rowCount > 0 && (await client.query("SELECT to_regclass($1) AS t", [`${SCHEMA}.schema_migrations`])).rows[0].t
          ? await appliedMigrations(client, SCHEMA)
          : new Set();
      const pending = files.filter((f) => !applied.has(f));
      console.log(`[dry-run] 스키마 ${SCHEMA} ${exists.rowCount > 0 ? "있음" : "없음(생성 예정)"}; 적용 예정: ${pending.join(", ") || "없음"}`);
      return;
    }

    await ensureSchema(client, SCHEMA);
    await ensureHistoryTable(client, SCHEMA);
    const applied = await appliedMigrations(client, SCHEMA);
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`건너뜀(이미 적용): ${file}`);
        continue;
      }
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await applyMigration(client, SCHEMA, file, sql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
      console.log(`적용: ${file}`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  // 데이터베이스 오류 메시지에는 연결 문자열이 섞일 수 있어 오류 이름과 코드만 출력한다. 이 스크립트가 직접 만든 안내문(코드 없음)은 그대로 출력한다.
  if (error?.code) console.error("마이그레이션 실패:", error.name ?? "Error", error.code);
  else console.error("마이그레이션 실패:", error?.message ?? "알 수 없는 오류");
  process.exitCode = 1;
});
