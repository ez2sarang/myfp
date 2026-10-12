import type { QueryResult, QueryResultRow } from "pg";

/** 풀, 트랜잭션 클라이언트, 시험용 클라이언트가 모두 만족하는 최소 인터페이스. 모든 쿼리는 매개변수화한다. */
export interface Db {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<QueryResult<R>>;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
