// 관리자 부트스트랩 판정 (순수 모듈): ADMIN_EMAILS 에 있는 이메일이면서 신뢰할 수 있는 공급자일 때만 관리자 후보다.
//  - google: 이메일이 검증된 경우에만 user.email 에 값이 들어온다 (auth.ts 의 profile 변환).
//  - credentials: 비상용 관리자 로그인 (별도 비밀번호 해시 확인을 통과한 경우에만 여기까지 온다).
//  - kakao: 이메일 정보를 쓰지 않으므로 어떤 경우에도 관리자 후보가 아니다.

export type AuthProviderId = "google" | "kakao" | "credentials";

export const AUTH_PROVIDERS: readonly AuthProviderId[] = ["google", "kakao", "credentials"];

export function isAuthProviderId(value: unknown): value is AuthProviderId {
  return typeof value === "string" && (AUTH_PROVIDERS as readonly string[]).includes(value);
}

/** 이메일을 소문자·공백 제거로 정규화한다. 형식이 이상하면 null. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 254) return null;
  if (/\s/.test(value)) return null;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) return null;
  return value;
}

export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const email = normalizeEmail(part);
    if (email) out.add(email);
  }
  return [...out];
}

export function isBootstrapAdmin(args: {
  email: string | null | undefined;
  provider: string;
  adminEmailsRaw: string | undefined;
}): boolean {
  if (args.provider !== "google" && args.provider !== "credentials") return false;
  const email = normalizeEmail(args.email);
  if (!email) return false;
  return parseAdminEmails(args.adminEmailsRaw).includes(email);
}
