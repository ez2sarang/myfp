// 이름 관문 (순수 모듈). 활성 계정인데 쓸 수 있는 이름(직접 정한 이름 또는 로그인 공급자 프로필 이름 중 눈에 보이는 글자·숫자가 있는 값)이
// 없으면, 서비스를 쓰기 전에 이름 입력 화면(/app/welcome)으로 보낸다. 운영자가 관리자 화면에서 가입자를 구분할 수 있게 하려는 것이다.
// 순서: 비로그인 → 로그인 / 차단·대기 → 기존 안내 / 활성인데 이름 없음 → 이름 입력 / 그 밖 통과. 이메일은 이름으로 치지 않는다.
// 이름 입력 화면과 이름 저장 액션만 allowNoName 으로 이 관문을 건너뛴다(리다이렉트 루프 없음). 비로그인 처리(proxy)는 바꾸지 않는다.
import { hasVisibleName } from "../account/display-name.ts";
import { safeCallbackPath } from "./callback-url.ts";
import { decideGate, decideShareAccess, type Gate, type ShareAccess } from "./gate.ts";
import type { UserStatus } from "./provision.ts";

export const WELCOME_PATH = "/app/welcome";

/** 쓸 수 있는 이름이 있는지: 직접 정한 이름 또는 공급자 프로필 이름 중 하나라도 보이는 글자·숫자가 있으면 true */
export function hasUsableName(names: { chosen: string | null | undefined; provider: string | null | undefined }): boolean {
  return hasVisibleName(names.chosen) || hasVisibleName(names.provider);
}

export type AppAccess = Gate | "name";

/** /app 화면·서버 액션의 판정 순서. hasName 은 활성일 때만 묻는다(대기·차단·비로그인은 이름을 보지 않는다) */
export function decideAppAccess(viewer: { status: UserStatus } | null, hasName: () => boolean, opts: { allowNoName?: boolean } = {}): AppAccess {
  const gate = decideGate(viewer);
  if (gate !== "ok") return gate;
  if (!opts.allowNoName && !hasName()) return "name";
  return "ok";
}

/** 공유 보기의 판정 순서: 대기 계정은 이름 없이도 열람(기존 규칙), 활성인데 이름 없으면 이름 입력. 토큰은 보지 않는다(유효·무효가 같게 보임) */
export function decideShareGate(viewer: { status: UserStatus } | null, hasName: () => boolean): ShareAccess | "name" {
  const access = decideShareAccess(viewer);
  if (access !== "ok") return access;
  if (viewer?.status === "active" && !hasName()) return "name";
  return "ok";
}

/** 이름 입력 뒤 돌아갈 곳: 같은 사이트의 내부 경로만(기존 callbackUrl 정규화), 이름 입력 화면 자신이면 /app */
export function welcomeNext(raw: unknown): string {
  const path = safeCallbackPath(raw, "/app");
  return path === WELCOME_PATH || path.startsWith(`${WELCOME_PATH}?`) || path.startsWith(`${WELCOME_PATH}/`) || path.startsWith(`${WELCOME_PATH}#`) ? "/app" : path;
}

/** 이름 입력 화면 주소 (돌아갈 경로를 next 로) */
export function welcomeUrl(callbackPath: string): string {
  return `${WELCOME_PATH}?next=${encodeURIComponent(welcomeNext(callbackPath))}`;
}
