// 같은 사이트 Origin 판정과 그 배선 시험 (검증 지적: Next 의 서버 액션 Origin 검사는 Origin 이 없으면 경고만 하고 실행한다).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { enforceSameOrigin, isSameOrigin, isSameOriginHeaders } from "../src/lib/http/origin.ts";
import { readCode, root, walk } from "./source-contract-helpers.ts";

const SITE = { host: "myfp.pineai.dev", forwardedHost: null, authUrl: "https://myfp.pineai.dev" };
const check = (origin: string | null | undefined, extra: Partial<Parameters<typeof isSameOrigin>[0]> = {}) =>
  isSameOrigin({ origin, ...SITE, ...extra });

test("Origin 헤더가 없거나 비어 있거나 \"null\" 이면 거부 (Next 기본 동작은 통과시킨다)", () => {
  for (const origin of [undefined, null, "", "   ", "null", "NULL"]) assert.equal(check(origin), false, String(origin));
});

test("다른 사이트 Origin 은 거부", () => {
  for (const origin of [
    "https://evil.example",
    "https://myfp.pineai.dev.evil.example",
    "https://evil-myfp.pineai.dev",
    "https://myfp.pineai.dev:8443",
    "http://myfp.pineai.dev:3000",
    "https://pineai.dev",
  ]) {
    assert.equal(check(origin), false, origin);
  }
});

test("Origin 형식이 올바르지 않으면 거부 (경로, 사용자 정보, 다른 스킴, 쓰레기 값)", () => {
  for (const origin of [
    "https://myfp.pineai.dev/admin",
    "https://myfp.pineai.dev/",
    "https://myfp.pineai.dev?x=1",
    "https://evil.example@myfp.pineai.dev", // scan-public: allow (가짜 시험 값)
    "https://myfp.pineai.dev@evil.example",
    "javascript:alert(1)",
    "ftp://myfp.pineai.dev",
    "myfp.pineai.dev",
    "//myfp.pineai.dev",
    "not a url",
  ]) {
    assert.equal(check(origin), false, origin);
  }
});

test("요청 호스트 또는 AUTH_URL 호스트와 같은 Origin 은 허용 (대소문자 무관)", () => {
  assert.equal(check("https://myfp.pineai.dev"), true);
  assert.equal(check("https://MYFP.pineai.DEV"), true);
  assert.equal(check("https://myfp.pineai.dev", { host: "internal:3000", authUrl: "https://myfp.pineai.dev" }), true, "프록시 뒤: AUTH_URL 호스트와 같음");
  assert.equal(check("https://myfp.pineai.dev", { host: "myfp.pineai.dev", authUrl: undefined }), true, "AUTH_URL 없음: 요청 호스트와 같음");
  assert.equal(check("https://myfp.pineai.dev", { host: "internal:3000", forwardedHost: "myfp.pineai.dev, other", authUrl: undefined }), true, "x-forwarded-host 첫 값");
  assert.equal(check("http://localhost:3330", { host: "localhost:3330", authUrl: "http://localhost:3330" }), true);
});

test("요청 호스트 정보도 AUTH_URL 도 없으면 어떤 Origin 도 거부하고, 잘못된 AUTH_URL 은 무시한다", () => {
  assert.equal(check("https://myfp.pineai.dev", { host: null, forwardedHost: null, authUrl: undefined }), false);
  assert.equal(check("https://myfp.pineai.dev", { host: null, forwardedHost: null, authUrl: "not a url" }), false);
  assert.equal(check("https://evil.example", { host: null, forwardedHost: null, authUrl: "not a url" }), false);
  assert.equal(check("https://evil.example", { host: "evil.example", authUrl: "https://myfp.pineai.dev" }), true, "요청 호스트가 같으면 같은 사이트로 본다 (Next 의 기본 검사와 같은 기준)");
});

test("헤더 읽기 도우미: origin, host, x-forwarded-host 를 읽는다", () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);
  assert.equal(isSameOriginHeaders(headers({ origin: "https://myfp.pineai.dev", host: "myfp.pineai.dev" }), undefined), true);
  assert.equal(isSameOriginHeaders(headers({ host: "myfp.pineai.dev" }), "https://myfp.pineai.dev"), false, "Origin 없음");
  assert.equal(isSameOriginHeaders(headers({ origin: "https://evil.example", host: "myfp.pineai.dev" }), "https://myfp.pineai.dev"), false);
  assert.equal(isSameOriginHeaders(headers({ origin: "https://myfp.pineai.dev", "x-forwarded-host": "myfp.pineai.dev" }), undefined), true);
});

// ---- 배선: 가드가 빠지거나 requirePerm 뒤로 밀리면 실패해야 한다 ----

function exportedActions(code: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /export async function (\w+)\([^)]*\)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < code.length && depth > 0) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
      i++;
    }
    out.push({ name: m[1]!, body: code.slice(start, i - 1) });
  }
  return out;
}

const ACTION_FILES: Record<string, { guard: RegExp; actions: string[] }> = {
  "src/lib/actions/fixed.ts": {
    guard: /requireActiveUser\(/,
    actions: ["createFixedAction", "updateFixedAction", "toggleFixedActiveAction", "archiveFixedAction", "deleteFixedAction"],
  },
  "src/lib/actions/balance.ts": { guard: /requireActiveUser\(/, actions: ["createBalanceAction", "updateBalanceAction", "deleteBalanceAction"] },
  "src/lib/actions/share.ts": { guard: /requireActiveUser\(/, actions: ["createShareAction", "revokeShareAction"] },
  "src/lib/actions/account.ts": { guard: /requireActiveUser\(/, actions: ["updateDisplayNameAction", "deleteAllDataAction", "deleteAccountAction"] },
  "src/lib/actions/admin.ts": { guard: /requireAdmin\(/, actions: ["setUserStatusAction"] },
  "src/lib/actions/household.ts": {
    guard: /requireActiveUser\(/,
    actions: [
      "createHouseholdAction",
      "renameHouseholdAction",
      "createInviteAction",
      "revokeInviteAction",
      "acceptInviteAction",
      "updateMembershipAction",
      "removeMemberAction",
      "leaveHouseholdAction",
      "deleteHouseholdAction",
    ],
  },
  "src/lib/actions/monthly.ts": {
    guard: /requireActiveUser\(/,
    actions: ["createPlannedAction", "updatePlannedAction", "setPlannedStatusAction", "deletePlannedAction", "setOverrideAction", "clearOverrideAction"],
  },
};

test("데이터 서버 액션은 모두 첫 문장이 await assertSameOrigin() 이고, 바로 다음이 세션 가드(requireActiveUser/requireAdmin)다", () => {
  for (const [file, spec] of Object.entries(ACTION_FILES)) {
    const code = readCode(file);
    assert.match(code, /import \{ assertSameOrigin \} from "@\/lib\/http\/assert-same-origin"/, file);
    const actions = exportedActions(code);
    assert.deepEqual(
      actions.map((a) => a.name),
      spec.actions,
      `${file}: 서버 액션 목록이 바뀌었다: 새 액션도 첫 줄에 assertSameOrigin, 다음 줄에 가드를 두고 이 목록에 추가한다`,
    );
    for (const action of actions) {
      const body = action.body.trimStart();
      assert.match(body, /^await assertSameOrigin\(\);/, `${action.name}: 첫 문장이 assertSameOrigin 이 아님`);
      const second = body.split("\n")[1] ?? "";
      assert.match(second, spec.guard, `${action.name}: 두 번째 문장이 세션 가드가 아님`);
      // 소유자 id 를 폼에서 읽지 않는다 (user_id·userId 필드는 관리자 대상 지정에만 쓴다)
      if (!file.endsWith("admin.ts")) assert.doesNotMatch(action.body, /formData\.get\("user_?[iI]d"\)/, `${action.name}: 폼의 사용자 id 를 읽으면 안 됨`);
    }
  }
});

test("Auth.js 라우트의 POST 는 같은 사이트 Origin 일 때만 핸들러로 넘기고 GET 은 그대로 둔다", () => {
  const code = readCode("src/app/api/auth/[...nextauth]/route.ts");
  assert.match(code, /export const GET = handlers\.GET;/);
  assert.match(code, /export async function POST\(request: Request\)/);
  assert.match(code, /if \(!isSameOriginHeaders\(request\.headers, process\.env\.AUTH_URL\)\) \{\s*return Response\.json\(\{ error: "forbidden" \}, \{ status: 403/);
  assert.ok(code.indexOf("isSameOriginHeaders(request.headers") < code.indexOf("handlers.POST(request"), "검사가 핸들러 호출보다 앞서야 함");
});

test("next.config.ts 는 serverActions.allowedOrigins 를 AUTH_URL 호스트로 설정한다", () => {
  const code = readCode("next.config.ts");
  assert.match(code, /serverActions:\s*\{\s*allowedOrigins/);
  assert.match(code, /process\.env\.AUTH_URL/);
});

// ---- 서버 액션 가드(assertSameOrigin)의 판정과 배선: 가드 한 줄이 시험 밖에 있던 공백(검증 B5) ----

class Denied extends Error {}
const deny = (): never => {
  throw new Denied("denied");
};

test("enforceSameOrigin: 같은 사이트가 아니면 deny 를 부르고, 같은 사이트면 부르지 않는다", () => {
  const AUTH_URL = "https://myfp.pineai.dev";
  const rejected: Array<Record<string, string>> = [
    { host: "myfp.pineai.dev" }, // Origin 없음 (Next 기본 동작은 이 요청을 실행한다)
    { origin: "null", host: "myfp.pineai.dev" },
    { origin: "https://evil.example", host: "myfp.pineai.dev" },
    { origin: "https://myfp.pineai.dev.evil.example", host: "myfp.pineai.dev" },
    {},
  ];
  for (const entries of rejected) {
    assert.throws(() => enforceSameOrigin(new Headers(entries), AUTH_URL, deny), Denied, JSON.stringify(entries));
  }
  let denied = 0;
  const count = (): never => {
    denied++;
    throw new Denied("denied");
  };
  enforceSameOrigin(new Headers({ origin: "https://myfp.pineai.dev", host: "myfp.pineai.dev" }), AUTH_URL, count);
  enforceSameOrigin(new Headers({ origin: "https://myfp.pineai.dev", host: "internal:3000" }), AUTH_URL, count);
  enforceSameOrigin(new Headers({ origin: "http://localhost:3330", host: "localhost:3330" }), undefined, count);
  assert.equal(denied, 0, "같은 사이트 요청에는 deny 를 부르면 안 됨");
});

test("assertSameOrigin 배선: next/headers 의 헤더와 AUTH_URL 로 enforceSameOrigin 을 부르고 거부는 notFound 로 한다", () => {
  const raw = readCode("src/lib/http/assert-same-origin.ts");
  assert.match(raw, /import \{ headers \} from "next\/headers";/);
  assert.match(raw, /import \{ notFound \} from "next\/navigation";/);
  assert.match(raw, /import \{ enforceSameOrigin \} from "\.\/origin";/);
  assert.match(raw, /export async function assertSameOrigin\(\): Promise<void> \{\s*enforceSameOrigin\(await headers\(\), process\.env\.AUTH_URL, notFound\);\s*\}/);
});

test("로그인·로그아웃 서버 액션 3개도 첫 문장이 await assertSameOrigin() 이다", () => {
  const code = readCode("src/components/auth/actions.ts");
  assert.match(code, /import \{ assertSameOrigin \} from "@\/lib\/http\/assert-same-origin"/);
  const actions = exportedActions(code);
  assert.deepEqual(
    actions.map((a) => a.name),
    ["signInWithProvider", "signInWithCredentials", "signOutAction"],
    "서버 액션 목록이 바뀌었다: 새 액션도 첫 줄에 assertSameOrigin 을 두고 이 목록에 추가한다",
  );
  for (const action of actions) {
    assert.match(action.body.trimStart(), /^await assertSameOrigin\(\);/, `${action.name}: 첫 문장이 assertSameOrigin 이 아님`);
  }
});

test("서버 액션 파일(\"use server\")은 이 시험이 보는 파일뿐이다 (새 서버 액션 파일이 가드 없이 생기지 않게)", () => {
  const files = walk(path.join(root, "src"))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .sort();
  assert.deepEqual(files, ["src/components/auth/actions.ts", ...Object.keys(ACTION_FILES)].sort());
});
