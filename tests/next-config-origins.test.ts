// next.config.ts 의 serverActions.allowedOrigins 값 시험. 기존 http-origin.test.ts 는 소스 문자열만 확인해서
// 값 자체가 틀려도(호스트 대신 주소 전체, 빈 항목 등) 실패하지 않았다. 환경 변수 AUTH_URL 을 바꿔 설정 모듈을 새로 읽고 실제 값을 비교한다.
// (이 파일은 node --test 가 별도 프로세스로 실행하므로 환경 변수를 바꿔도 다른 시험 파일에 영향이 없다. 끝나면 원래 값으로 되돌린다.)
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

const original = process.env.AUTH_URL;
let load = 0;

beforeEach(() => {
  delete process.env.AUTH_URL;
});
afterEach(() => {
  if (original === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = original;
});

/** AUTH_URL 을 설정한 채 설정 모듈을 새로 읽어 allowedOrigins 를 돌려준다 (모듈 캐시를 피하려고 매번 다른 쿼리 문자열을 붙인다). */
async function allowedOriginsFor(authUrl: string | undefined): Promise<unknown> {
  if (authUrl === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = authUrl;
  const mod = (await import(`../next.config.ts?origins=${++load}`)) as { default: { experimental?: { serverActions?: { allowedOrigins?: unknown } } } };
  return mod.default.experimental?.serverActions?.allowedOrigins;
}

test("AUTH_URL 의 호스트 하나만 허용한다 (스킴, 경로, 끝 슬래시 제외)", async () => {
  assert.deepEqual(await allowedOriginsFor("https://myfp.pineai.dev"), ["myfp.pineai.dev"]);
  assert.deepEqual(await allowedOriginsFor("https://myfp.pineai.dev/"), ["myfp.pineai.dev"]);
  assert.deepEqual(await allowedOriginsFor("https://myfp.pineai.dev/api/auth?x=1"), ["myfp.pineai.dev"]);
  assert.deepEqual(await allowedOriginsFor("  https://myfp.pineai.dev  "), ["myfp.pineai.dev"], "앞뒤 공백 무시");
});

test("호스트는 소문자로, 포트가 있으면 포트까지 같은 형태로 허용한다 (Next 는 Origin 의 host 와 그대로 비교한다)", async () => {
  assert.deepEqual(await allowedOriginsFor("https://MYFP.PineAI.dev"), ["myfp.pineai.dev"]);
  assert.deepEqual(await allowedOriginsFor("http://localhost:3330"), ["localhost:3330"]);
  assert.deepEqual(await allowedOriginsFor("https://myfp.pineai.dev:443"), ["myfp.pineai.dev"], "기본 포트는 URL 정규화로 생략된다");
});

test("AUTH_URL 이 없거나 비었거나 주소 형식이 아니면 목록이 비어 있다 (어떤 호스트도 임의로 허용하지 않는다)", async () => {
  for (const bad of [undefined, "", "   ", "not a url", "myfp.pineai.dev", "//myfp.pineai.dev"]) {
    assert.deepEqual(await allowedOriginsFor(bad), [], String(bad));
  }
});

test("허용 목록에 와일드카드나 다른 사이트 호스트가 들어가지 않는다", async () => {
  const list = (await allowedOriginsFor("https://myfp.pineai.dev")) as string[];
  assert.equal(list.length, 1);
  for (const entry of list) {
    assert.ok(!entry.includes("*"), entry);
    assert.ok(!entry.includes("://"), entry);
    assert.ok(!entry.includes("/"), entry);
    assert.equal(entry, entry.toLowerCase());
  }
});
