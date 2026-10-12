// PostgreSQL 연결 (서버 전용). 서버리스 친화: 인스턴스당 풀은 하나, 연결은 최대 3개, 유휴 연결은 빨리 닫는다.
// 모든 쿼리는 스키마를 myfp. 로 명시한다. search_path 는 보조 안전장치로 myfp 에 고정한다(시작 옵션 + 운영 DB 의 역할 수준 설정).
// 식별자는 코드에 고정된 문자열만 쓰고 사용자 입력을 넣지 않는다. 값은 항상 매개변수($1...)로 넘긴다.
import pg from "pg";
import type { Db } from "./types.ts";

export const APP_SCHEMA = "myfp";

type GlobalWithPool = typeof globalThis & { __myfpPgPool?: pg.Pool };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * 원격 DB(운영 풀러)에는 TLS 로 접속한다. 로컬 개발·시험 DB 는 TLS 없이 접속한다.
 * 한계: Supabase 풀러의 인증서 체인이 Node 기본 신뢰 목록에 없어 인증서 검증은 끈다(rejectUnauthorized false).
 * 즉 구간 암호화는 되지만 서버 신원 검증은 안 된다. DATABASE_CA(PEM)를 주면 그 CA 로 검증한다.
 */
export function tlsOptionFor(connectionString: string, ca: string | undefined = process.env.DATABASE_CA): pg.PoolConfig["ssl"] {
  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
  if (LOCAL_HOSTS.has(host)) return undefined;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    options: `-c search_path=${APP_SCHEMA}`,
    ssl: tlsOptionFor(connectionString),
  });
  // 유휴 연결의 오류가 프로세스를 죽이지 않게 한다. 메시지에는 연결 문자열이 들어갈 수 있어 오류 이름만 남긴다.
  pool.on("error", (error) => {
    console.error("[db] idle client error:", error.name);
  });
  return pool;
}

export function getPool(): pg.Pool {
  const g = globalThis as GlobalWithPool;
  g.__myfpPgPool ??= createPool();
  return g.__myfpPgPool;
}

export const db: Db = {
  query: (text, params) => getPool().query(text, params as unknown[] | undefined),
};

/** 하나의 트랜잭션으로 실행한다. 예외가 나면 ROLLBACK. */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn({ query: (text, params) => client.query(text, params as unknown[] | undefined) });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
