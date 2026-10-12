// 시험용 가짜 Db: 실행된 SQL 과 매개변수를 기록하고, 응답은 시험이 정한 함수가 돌려준다. 실제 DB 에 연결하지 않는다.
import type { QueryResult, QueryResultRow } from "pg";
import type { Db } from "../src/lib/db/types.ts";

export interface Call {
  text: string;
  params: readonly unknown[];
}

export function fakeDb(respond: (call: Call) => { rows?: QueryResultRow[]; rowCount?: number } | Error = () => ({ rows: [], rowCount: 0 })) {
  const calls: Call[] = [];
  const db: Db = {
    async query<R extends QueryResultRow = QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
      const call = { text: text.replace(/\s+/g, " ").trim(), params };
      calls.push(call);
      const out = respond(call);
      if (out instanceof Error) throw out;
      const rows = (out.rows ?? []) as R[];
      return { rows, rowCount: out.rowCount ?? rows.length, command: "", oid: 0, fields: [] } as QueryResult<R>;
    },
  };
  return { db, calls };
}
