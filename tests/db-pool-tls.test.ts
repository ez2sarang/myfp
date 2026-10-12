import test from "node:test";
import assert from "node:assert/strict";
import { tlsOptionFor } from "../src/lib/db/pool.ts";

test("로컬 DB 는 TLS 없이 접속한다", () => {
  assert.equal(tlsOptionFor("postgresql://u:p@127.0.0.1:54322/postgres"), undefined); // scan-public: allow (가짜 연결 문자열)
  assert.equal(tlsOptionFor("postgresql://u:p@localhost:5432/db"), undefined); // scan-public: allow (가짜 연결 문자열)
  assert.equal(tlsOptionFor("postgresql://u:p@[::1]:5432/db"), undefined); // scan-public: allow (가짜 연결 문자열)
});

test("원격 DB(운영 풀러)는 TLS 로 접속하고 CA 가 없으면 검증을 끈다", () => {
  const opt = tlsOptionFor("postgresql://myfp_app.ref:pw@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres", undefined); // scan-public: allow (가짜 연결 문자열)
  assert.deepEqual(opt, { rejectUnauthorized: false });
});

test("CA 를 주면 인증서를 검증한다", () => {
  const opt = tlsOptionFor("postgresql://u:p@db.example.com:5432/db", "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----"); // scan-public: allow (가짜 연결 문자열)
  assert.deepEqual(opt, { ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----", rejectUnauthorized: true });
});

test("해석할 수 없는 연결 문자열은 TLS 설정을 건드리지 않는다", () => {
  assert.equal(tlsOptionFor("not a url"), undefined);
});

test("호스트 이름에 로컬 문자열이 들어 있어도 원격이면 TLS 를 쓴다", () => {
  const opt = tlsOptionFor("postgresql://u:p@localhost.evil.example.com:5432/db", undefined); // scan-public: allow (가짜 연결 문자열)
  assert.deepEqual(opt, { rejectUnauthorized: false });
});
