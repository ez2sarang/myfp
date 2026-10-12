// proxy 의 판정 (순수 모듈): 공개 경로는 통과, 보호 경로는 유효한 세션이 있을 때만 통과한다.
// proxy.ts 는 이 결과를 NextResponse 로 옮기기만 한다. 세션 확인이 실패(예외)하면 닫는다.
import { safeCallbackPath } from "./callback-url.ts";
import { classifyPath } from "./route-guard.ts";

export type ProxyDecision =
  | { action: "next" }
  | { action: "unauthorized" }
  /** callback 은 로그인 뒤 돌아갈 안전한 상대 경로이고, 안전하지 않으면 빈 문자열 */
  | { action: "login"; callback: string };

export async function decideProxy(pathname: string, search: string, hasSession: () => Promise<boolean>): Promise<ProxyDecision> {
  const kind = classifyPath(pathname);
  if (kind === "public") return { action: "next" };
  let signedIn = false;
  try {
    signedIn = (await hasSession()) === true;
  } catch {
    signedIn = false;
  }
  if (signedIn) return { action: "next" };
  if (kind === "protected-api") return { action: "unauthorized" };
  return { action: "login", callback: safeCallbackPath(`${pathname}${search}`, "") };
}
