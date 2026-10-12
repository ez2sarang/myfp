#!/usr/bin/env node
// 개인 데이터 적재기: 저장소 밖의 시드(JSON)를 소유자 계정의 고정지출·자산/부채로 넣는다.
//
//   node scripts/import-private.mjs <seed.json>            # 기본: dry-run (검증하고 건수만 출력, DB 에 쓰지 않음)
//   node scripts/import-private.mjs <seed.json> --apply    # 멱등 upsert (키: user_id + external_key)
//
// - 소유자: 환경 변수 ADMIN_EMAILS 의 첫 이메일. users 행이 없으면 만든다(status active, role admin, 로그인 수단 미연결).
//   이후 같은 이메일의 "검증된" Google 계정으로 로그인하면 이 행에 연결된다(카카오는 이메일로 연결되지 않는다).
// - 연결 문자열은 환경 변수에서만 읽는다: DATABASE_URL, 없으면 MIGRATE_DATABASE_URL.
// - 출력에는 건수만 남긴다. 금액·이름·이메일·연결 정보는 출력하지 않는다.
import { readFile } from "node:fs/promises";
import pg from "pg";
import { normalizeSeed } from "../src/lib/finance/import.ts";
import { LIMITS } from "../src/lib/finance/types.ts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function sslFor(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? undefined : { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const opts = { file: null, apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (!arg.startsWith("--") && opts.file === null) opts.file = arg;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  if (!opts.file) throw new Error("사용법: node scripts/import-private.mjs <seed.json> [--apply]");
  return opts;
}

const FIXED_COLS = [
  "name",
  "category",
  "amount",
  "cycle",
  "billing_day",
  "billing_month",
  "payment_method",
  "institution",
  "start_date",
  "end_date",
  "active",
  "note",
  "source",
];
const fixedValues = (v) => [v.name, v.category, v.amount, v.cycle, v.billingDay, v.billingMonth, v.paymentMethod, v.institution, v.startDate, v.endDate, v.active, v.note, v.source];
const BALANCE_COLS = ["kind", "category", "name", "amount", "as_of", "note", "monthly_payment", "interest_rate", "end_date"];
const balanceValues = (v) => [v.kind, v.category, v.name, v.amount, v.asOf, v.note, v.monthlyPayment, v.interestRate, v.endDate];

async function upsert(client, table, cols, userId, externalKey, values) {
  const all = ["user_id", "external_key", ...cols];
  const placeholders = all.map((_, i) => `$${i + 1}`).join(", ");
  const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  const res = await client.query(
    `INSERT INTO myfp.${table} (${all.join(", ")}) VALUES (${placeholders})
     ON CONFLICT (user_id, external_key) WHERE external_key IS NOT NULL DO UPDATE SET ${updates}, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [userId, externalKey, ...values],
  );
  return res.rows[0]?.inserted === true;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const seed = JSON.parse(await readFile(opts.file, "utf8"));
  const result = normalizeSeed(seed, process.env.ADMIN_EMAILS);
  if (!result.ok) {
    console.error(`시드 검증 실패 (${result.errors.length}건):`);
    for (const e of result.errors) console.error(` - ${e}`);
    process.exitCode = 1;
    return;
  }
  const { ownerEmail, fixed, balances } = result.value;
  const assets = balances.filter((b) => b.input.kind === "asset").length;
  console.log(`검증 통과: 고정지출 ${fixed.length}건, 자산 ${assets}건, 부채 ${balances.length - assets}건`);
  if (!opts.apply) {
    console.log("dry-run: DB 에 쓰지 않았습니다. 적용하려면 --apply 를 붙이세요.");
    return;
  }

  const url = process.env.DATABASE_URL || process.env.MIGRATE_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 또는 MIGRATE_DATABASE_URL 이 필요합니다.");
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000, ssl: sslFor(url) });
  await client.connect();
  try {
    await client.query("BEGIN");
    let owner = (await client.query("SELECT id::text AS id FROM myfp.users WHERE lower(email) = $1 FOR UPDATE", [ownerEmail])).rows[0];
    let ownerCreated = false;
    if (!owner) {
      owner = (
        await client.query("INSERT INTO myfp.users (email, status, role) VALUES ($1, 'active', 'admin') RETURNING id::text AS id", [ownerEmail])
      ).rows[0];
      ownerCreated = true;
      await client.query(
        `INSERT INTO myfp.audit_log (actor_user_id, action, target_type, target_key, after) VALUES (NULL, 'user.signup', 'user', $1, $2::jsonb)`,
        [owner.id, JSON.stringify({ via: "import", status: "active", role: "admin" })],
      );
    }
    const counts = await client.query(
      `SELECT (SELECT count(*) FROM myfp.fixed_expenses WHERE user_id = $1 AND (external_key IS NULL OR NOT external_key = ANY($2)))::int AS f,
              (SELECT count(*) FROM myfp.balance_items WHERE user_id = $1 AND (external_key IS NULL OR NOT external_key = ANY($3)))::int AS b`,
      [owner.id, fixed.map((f) => f.externalKey), balances.map((b) => b.externalKey)],
    );
    if (counts.rows[0].f + fixed.length > LIMITS.fixedExpenses || counts.rows[0].b + balances.length > LIMITS.balanceItems) {
      throw new Error("사용자당 상한을 넘습니다. 시드를 줄이거나 기존 항목을 정리하세요.");
    }
    const tally = { fixedInserted: 0, fixedUpdated: 0, balanceInserted: 0, balanceUpdated: 0 };
    for (const f of fixed) {
      if (await upsert(client, "fixed_expenses", FIXED_COLS, owner.id, f.externalKey, fixedValues(f.input))) tally.fixedInserted += 1;
      else tally.fixedUpdated += 1;
    }
    for (const b of balances) {
      if (await upsert(client, "balance_items", BALANCE_COLS, owner.id, b.externalKey, balanceValues(b.input))) tally.balanceInserted += 1;
      else tally.balanceUpdated += 1;
    }
    await client.query("COMMIT");
    console.log(`적용 완료: 소유자 ${ownerCreated ? "새로 만듦" : "기존 행 사용"}`);
    console.log(`고정지출 신규 ${tally.fixedInserted}건 · 갱신 ${tally.fixedUpdated}건 / 자산·부채 신규 ${tally.balanceInserted}건 · 갱신 ${tally.balanceUpdated}건`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  // DB 오류 메시지에는 값이나 연결 정보가 섞일 수 있어 이름·코드만 출력한다. 이 스크립트가 만든 안내문(코드 없음)은 그대로 출력한다.
  if (error?.code) console.error("적재 실패:", error.name ?? "Error", error.code);
  else console.error("적재 실패:", error?.message ?? "알 수 없는 오류");
  process.exitCode = 1;
});
