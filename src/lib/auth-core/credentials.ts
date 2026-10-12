// 비상용 관리자 로그인(Credentials) 판정 (순수 모듈, 의존성은 주입). Auth.js authorize() 가 이 함수를 부른다.
//  - AUTH_ENABLE_CREDENTIALS 가 1 또는 true 이고, ADMIN_EMAILS 가 비어 있지 않고, 비밀번호 해시가 올바른 형식일 때만 켜진다.
//  - 이메일이 목록에 없어도 같은 비용의 해시 계산을 해서 응답 시간으로 계정 존재를 알 수 없게 한다.
//  - 실패하면 고정 지연을 주고 이메일 키와 클라이언트 키로 실패 횟수를 센다. 한도를 넘으면 맞는 비밀번호도 거부한다.
import { parseAdminEmails, normalizeEmail } from "./admin-emails.ts";
import { looksLikeHash } from "./password.ts";
import type { AttemptLimiter } from "./rate-limit.ts";

export interface CredentialEnv {
  enabled: string | undefined;
  adminEmails: string | undefined;
  passwordHash: string | undefined;
}

export const FAILURE_DELAY_MS = 800;

export function credentialsEnabled(env: CredentialEnv): boolean {
  const flag = (env.enabled ?? "").trim().toLowerCase();
  if (flag !== "1" && flag !== "true") return false;
  return parseAdminEmails(env.adminEmails).length > 0 && looksLikeHash(env.passwordHash);
}

export type CredentialResult =
  | { ok: true; email: string }
  | { ok: false; reason: "disabled" | "invalid" | "locked" };

export async function authorizeAdminCredentials(args: {
  email: unknown;
  password: unknown;
  clientKeys: readonly string[];
  env: CredentialEnv;
  limiter: AttemptLimiter;
  verify: (plain: unknown, hash: string | undefined) => Promise<boolean>;
  dummyHash: () => Promise<string>;
  delay: (ms: number) => Promise<void>;
}): Promise<CredentialResult> {
  const { env, limiter } = args;
  if (!credentialsEnabled(env)) return { ok: false, reason: "disabled" };

  const email = normalizeEmail(args.email);
  const keys = [...(email ? [`email:${email}`] : []), ...args.clientKeys];
  const fail = async (reason: "invalid" | "locked"): Promise<CredentialResult> => {
    for (const k of keys) limiter.recordFailure(k);
    await args.delay(FAILURE_DELAY_MS);
    return { ok: false, reason };
  };

  if (keys.some((k) => limiter.isBlocked(k))) {
    // 잠긴 상태의 추가 시도는 실패 횟수를 더 올리지 않고 지연만 준다.
    await args.delay(FAILURE_DELAY_MS);
    return { ok: false, reason: "locked" };
  }

  const listed = email !== null && parseAdminEmails(env.adminEmails).includes(email);
  const matched = listed
    ? await args.verify(args.password, env.passwordHash)
    : (await args.verify(args.password, await args.dummyHash()), false);

  if (!listed || !matched || email === null) return fail("invalid");
  for (const k of keys) limiter.reset(k);
  return { ok: true, email };
}
