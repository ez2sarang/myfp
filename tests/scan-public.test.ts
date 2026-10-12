// 공개 저장소 검사 스크립트: 가짜 비밀값·개인정보 패턴을 잡고, 일치한 값은 출력하지 않는다.
// 가짜 값은 실행 중에 조립한다(이 시험 파일 자체가 검사에 걸리지 않게).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { root } from "./source-contract-helpers.ts";

function scan(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "myfp-scan-"));
  try {
    const paths = Object.entries(files).map(([name, text]) => {
      const p = path.join(dir, name);
      writeFileSync(p, text);
      return p;
    });
    return spawnSync(process.execPath, [path.join(root, "scripts", "scan-public.mjs"), ...paths], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("깨끗한 파일은 통과", () => {
  const r = scan({ "ok.ts": 'export const x = "hello@example.com";\nconst d = "2026-10-12";\n' });
  assert.equal(r.status, 0, r.stderr);
});

test("비밀값·개인정보 패턴은 실패하고, 값은 출력하지 않는다", () => {
  const secretPw = ["s3cr3t", "Passw0rd", "Value"].join("");
  const cases: Record<string, string> = {
    "db.txt": `url=postgres://user:${secretPw}@db.internal:5432/x`, // scan-public: allow (가짜 시험 값)
    "aws.txt": `key ${"AKIA"}${"ABCDEFGHIJKLMNOP"}`,
    "card.txt": ["1234", "5678", "9012", "3456"].join("-"),
    "acct.txt": ["110", "123", "456789"].join("-"),
    "mail.txt": `contact ${"someone"}@${"realmail"}.com`,
    "b64.txt": "x".repeat(10) + "Q9".repeat(20),
    ".env": "AUTH_SECRET=x",
  };
  const r = scan(cases);
  assert.equal(r.status, 1);
  for (const rule of ["postgres-url-with-password", "aws-access-key", "card-number", "bank-account", "email-address", "long-base64", "tracked-env-file"]) {
    assert.match(r.stderr, new RegExp(rule), rule);
  }
  assert.equal(r.stderr.includes(secretPw), false, "값은 출력하지 않는다");
});
