// 이름 관문: 활성인데 쓸 수 있는 이름(직접 정한 이름·공급자 이름 중 보이는 글자·숫자)이 없으면 이름 입력 화면으로. 합성 값만 쓴다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { hasVisibleName } from "../src/lib/account/display-name.ts";
import { WELCOME_PATH, decideAppAccess, decideShareGate, hasUsableName, welcomeNext, welcomeUrl } from "../src/lib/auth-core/name-gate.ts";
import { userHasUsableName } from "../src/lib/db/queries/users.ts";
import { fakeDb } from "./fake-db.ts";
import { root, walk } from "./source-contract-helpers.ts";

const read = (f: string) => readFileSync(path.join(root, f), "utf8");

/** 내보낸 함수 이름과 본문(다음 export 전까지) */
function exportedFunctions(code: string): { name: string; body: string }[] {
  const starts = [...code.matchAll(/export async function (\w+)/g)];
  return starts.map((m, i) => ({ name: m[1]!, body: code.slice(m.index!, starts[i + 1]?.index ?? code.length) }));
}
const USER = "11111111-1111-4111-8111-111111111111";

test("이름 판정: 보이는 글자·숫자가 하나라도 있어야 이름 (공백·보이지 않는 문자·채움 문자·이모지만은 빈 것)", () => {
  for (const empty of [null, undefined, "", "   ", "\u{200B}", "\u{3164}", "\u{115F}\u{1160}", "\u{FFA0}", "\u{1F600}", "\u{1F469}\u{200D}\u{1F4BB}", "\u{00AD}", "\u{E0041}", ".", "!!"]) {
    assert.equal(hasVisibleName(empty), false, JSON.stringify(empty));
  }
  for (const named of ["엄마", "A", "7", " 가상 ", "엄마\u{200B}", "\u{1F600}가상", "\u{110B}\u{1165}\u{11B7}"]) {
    assert.equal(hasVisibleName(named), true, JSON.stringify(named));
  }
});

test("쓸 수 있는 이름: 직접 정한 이름 또는 공급자 이름 중 하나 (이메일은 이름이 아니다)", () => {
  assert.equal(hasUsableName({ chosen: "가상이름", provider: null }), true);
  assert.equal(hasUsableName({ chosen: null, provider: "가상 공급자 이름" }), true, "Google 등 이름이 있는 계정은 그대로");
  assert.equal(hasUsableName({ chosen: "\u{200B}", provider: "가상" }), true, "직접 정한 이름이 비면 공급자 이름");
  assert.equal(hasUsableName({ chosen: null, provider: "\u{3164}" }), false);
  assert.equal(hasUsableName({ chosen: null, provider: null }), false);
});

test("가드 순서: 비로그인 → 차단·대기(이름을 보지 않음) → 활성인데 이름 없음 → 통과", () => {
  let asked = 0;
  const noName = () => (asked++, false);
  assert.equal(decideAppAccess(null, noName), "login");
  assert.equal(decideAppAccess({ status: "blocked" }, noName), "blocked");
  assert.equal(decideAppAccess({ status: "pending" }, noName), "pending");
  assert.equal(asked, 0, "대기·차단·비로그인은 이름을 조회하지 않는다");
  assert.equal(decideAppAccess({ status: "active" }, noName), "name");
  assert.equal(decideAppAccess({ status: "active" }, () => true), "ok", "이미 이름이 있으면 변화 없음");
  assert.equal(decideAppAccess({ status: "active" }, noName, { allowNoName: true }), "ok", "이름 입력 화면·이름 저장 액션은 통과(루프 없음)");
});

test("공유 보기: 대기 계정은 이름 없이도 열람(기존), 활성인데 이름 없으면 이름 입력 — 토큰을 보지 않으므로 유효·무효 토큰이 같게 보인다", () => {
  assert.equal(decideShareGate(null, () => false), "login");
  assert.equal(decideShareGate({ status: "blocked" }, () => false), "blocked");
  assert.equal(decideShareGate({ status: "pending" }, () => false), "ok");
  assert.equal(decideShareGate({ status: "active" }, () => false), "name");
  assert.equal(decideShareGate({ status: "active" }, () => true), "ok");
  // 이름 입력 주소는 토큰 모양과 상관없이 같은 규칙(돌아갈 경로만 다름)
  assert.equal(welcomeUrl("/s/valid-looking-token"), "/app/welcome?next=%2Fs%2Fvalid-looking-token");
  assert.equal(welcomeUrl("/s/x"), "/app/welcome?next=%2Fs%2Fx");
  // 가드 위치: 공유 화면은 토큰 조회 전에 requireShareViewer, 그 안에서 이름 관문을 return 전에 판정
  const session = read("src/lib/session.ts");
  const share = session.slice(session.indexOf("export async function requireShareViewer"), session.indexOf("export async function requireAdmin"));
  assert.ok(share.indexOf("viewerHasUsableName(") > 0 && share.indexOf("viewerHasUsableName(") < share.indexOf("return {"), "이름 관문이 return 앞");
  assert.match(share, /status === "active"/);
  const page = read("src/app/s/[token]/page.tsx");
  assert.ok(page.indexOf("requireShareViewer(") < page.indexOf("resolveShareView("), "토큰 조회보다 가드가 먼저");
  // 초대 화면도 토큰 확인 전에 requireActiveUser
  const join = read("src/app/join/[token]/page.tsx");
  assert.ok(join.indexOf("requireActiveUser(") < join.indexOf("findInvite("));
});

test("돌아갈 곳(next): 같은 사이트 내부 경로만, 오픈 리다이렉트·이름 입력 화면 자신은 /app", () => {
  for (const bad of [
    "//evil.example",
    "https://evil.example/s/x",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "/%2F%2Fevil.example",
    "/app\r\nLocation: https://evil.example",
    `/${"a".repeat(600)}`,
    "javascript:alert(1)",
    "/login?callbackUrl=%2Fapp",
    "/api/auth/signout",
    undefined,
    42,
  ]) {
    assert.equal(welcomeNext(bad), "/app", JSON.stringify(bad));
  }
  for (const loop of [WELCOME_PATH, `${WELCOME_PATH}?next=%2Fapp`, `${WELCOME_PATH}/x`, `${WELCOME_PATH}#a`]) assert.equal(welcomeNext(loop), "/app", loop);
  assert.equal(welcomeNext("/s/x"), "/s/x");
  assert.equal(welcomeNext("/join/x"), "/join/x");
  assert.equal(welcomeNext("/app?tab=planned"), "/app?tab=planned");
  assert.equal(welcomeUrl("//evil.example"), "/app/welcome?next=%2Fapp");
});

test("서버 가드 배선: 대기 판정 뒤에 이름 관문, 이름 관문을 건너뛰는 곳은 정확히 다섯 곳(이름 입력·설정 화면, 이름 저장·데이터 삭제·계정 삭제 액션)", () => {
  const session = read("src/lib/session.ts");
  const active = session.slice(session.indexOf("export async function requireActiveUser"), session.indexOf("export async function requireShareViewer"));
  const order = ['if (gate === "login")', "if (gate !== \"ok\") redirect(PENDING_PATH);", "opts.allowNoName", "redirect(welcomeUrl(callbackPath))", "return viewer as Viewer;"].map((s) => active.indexOf(s));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]!)), JSON.stringify(order));
  assert.doesNotMatch(session, /display/i, "Viewer 에 이름 값을 싣지 않는다(불리언만)");
  // allowNoName 사용처: 정확히 다섯 곳 — 이름 입력 화면·설정 화면(페이지 2) + 이름 저장·내 데이터 전체 삭제·계정 삭제(액션 3)
  const files = walk(path.join(root, "src")).map((f) => path.relative(root, f).split(path.sep).join("/")).filter((f) => /\.(ts|tsx)$/.test(f));
  const users = files.filter((f) => /allowNoName: true/.test(read(f)));
  assert.deepEqual(users.sort(), ["src/app/app/settings/page.tsx", "src/app/app/welcome/page.tsx", "src/lib/actions/account.ts"]);
  for (const page of ["src/app/app/settings/page.tsx", "src/app/app/welcome/page.tsx"]) assert.equal((read(page).match(/allowNoName: true/g) ?? []).length, 1, page);
  const account = read("src/lib/actions/account.ts");
  const exempt = exportedFunctions(account).filter((fn) => /allowNoName: true/.test(fn.body)).map((fn) => fn.name);
  assert.deepEqual(exempt.sort(), ["deleteAccountAction", "deleteAllDataAction", "updateDisplayNameAction"]);
  for (const fn of exportedFunctions(account).filter((x) => exempt.includes(x.name))) {
    assert.match(fn.body, /await requireActiveUser\("\/app\/settings", \{ allowNoName: true \}\)/, fn.name);
  }
  // 그 밖의 모든 가드 호출은 옵션 없이(이름 관문을 거침) — CSV 내보내기 라우트 포함
  for (const f of files.filter((x) => x !== "src/lib/session.ts")) {
    for (const call of read(f).match(/requireActiveUser\([^)]*\)/g) ?? []) {
      if (!call.includes("allowNoName")) continue;
      assert.ok(users.includes(f), `${f}: ${call}`);
    }
  }
  const exportRoute = read("src/app/app/export/[kind]/route.ts");
  assert.match(exportRoute, /requireActiveUser\(/);
  assert.doesNotMatch(exportRoute, /allowNoName/);
  // 설정 화면은 본인 계정·표시 이름·삭제만: 공유 링크·그룹·재무 조회를 하지 않는다(이름 없이 다른 데이터에 닿는 길 없음)
  const settings = read("src/app/app/settings/page.tsx");
  assert.doesNotMatch(settings, /queries\/(share|household|fixed|balance|monthly)|listShare|getMembership|visibleToViewer|listFixed|listBalances|listPlanned/);
  assert.deepEqual([...settings.matchAll(/from "@\/lib\/db\/queries\/([a-z-]+)"/g)].map((m) => m[1]), ["users"]);
});

test("이름 입력 화면: 가드 변형으로 루프 없음, 이미 이름이 있으면 돌아갈 곳으로, 저장 뒤 정규화한 next 로 이동, 오류에 입력값 없음", () => {
  const page = read("src/app/app/welcome/page.tsx");
  const order = ["welcomeNext(", "requireActiveUser(", "{ allowNoName: true }", "viewerHasUsableName(viewer.id)) redirect(next)", "return ("].map((s) => page.indexOf(s));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]!)), JSON.stringify(order));
  assert.match(page, /updateDisplayNameAction/);
  assert.match(page, /signOutAction/);
  assert.match(page, /이름을 입력하지 않고 나가려면[\s\S]{0,200}href="\/app\/settings#account-delete-confirm"[\s\S]{0,200}계정을 삭제할 수 있습니다/);
  const form = read("src/components/settings/welcome-name-form.tsx");
  assert.match(form, /if \(state\?\.ok\) router\.replace\(next\);/);
  assert.doesNotMatch(form, /state\.values|defaultValue/, "입력값을 다시 반사하지 않는다");
  assert.match(form, /name="displayName"/);
});

test("이름 조회는 이름 두 칸만 읽고 값 대신 불리언만 돌려준다 (세션 사용자 id 로만)", async () => {
  const { db, calls } = fakeDb((c) => (c.params[0] === USER ? { rows: [{ name: null, display_name: "가상이름" }] } : { rows: [] }));
  assert.equal(await userHasUsableName(db, USER), true);
  assert.match(calls[0]!.text, /^SELECT u\.name, to_jsonb\(u\) ->> 'display_name' AS display_name FROM myfp\.users u WHERE u\.id = \$1$/);
  assert.deepEqual(calls[0]!.params, [USER]);
  const empty = fakeDb(() => ({ rows: [{ name: "\u{3164}", display_name: null }] }));
  assert.equal(await userHasUsableName(empty.db, USER), false);
  const none = fakeDb(() => ({ rows: [] }));
  assert.equal(await userHasUsableName(none.db, USER), false);
  const bad = fakeDb();
  assert.equal(await userHasUsableName(bad.db, "not-a-uuid"), false);
  assert.equal(bad.calls.length, 0);
});

test("처리방침: 표시 이름은 공급자 이름이 없으면 처음 이용 전에 입력해야 함을 사실대로 적는다", () => {
  const privacy = read("src/app/(marketing)/privacy/page.tsx");
  assert.match(privacy, /로그인 공급자가 준 이름이 없으면 처음 이용하기 전에 입력해야 합니다/);
  assert.doesNotMatch(privacy, /표시 이름\(선택\)/);
});

test("설정의 표시 이름 칸: 「(선택)」 대신 공급자 이름이 없으면 필수라는 사실 안내(처리방침과 같은 내용), 지우기는 그대로", () => {
  const form = read("src/components/settings/display-name-form.tsx");
  assert.doesNotMatch(form, /\(선택\)/);
  assert.match(form, /로그인 공급자가 이름을 주지 않았다면 필수입니다/);
  assert.match(form, /aria-describedby="display-name-required display-name-hint"/);
  assert.match(form, /value="clear"/);
  assert.match(read("src/app/(marketing)/privacy/page.tsx"), /로그인 공급자가 준 이름이 없으면 처음 이용하기 전에 입력해야 합니다/);
});
