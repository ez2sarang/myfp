// 로그인 시 사용자 생성·연결·갱신 정책 (순수 모듈). DB 쓰기는 src/lib/db/queries/provision.ts 가 이 판정대로 수행한다.
//  - 사용자(users)와 로그인 수단(accounts: 공급자 + 공급자 계정 id)은 분리돼 있다. 한 사용자에 여러 로그인 수단이 붙을 수 있다.
//  - 이미 연결된 로그인 수단이면 그 사용자로 로그인한다. blocked 는 항상 거부.
//  - 연결된 수단이 없으면 "신뢰할 수 있는 이메일"(Google 의 검증된 이메일, 비상용 credentials 의 관리자 이메일)이 같은 기존 사용자에 연결한다.
//    Kakao 는 이메일을 쓰지 않으므로(검증 여부를 알 수 없음) 이메일로 기존 계정에 붙지 않는다 — 계정 탈취 방지.
//  - 신규 가입은 기본적으로 바로 사용(active, member). ADMIN_EMAILS 의 신뢰 이메일은 active + admin.
//    안전장치: SIGNUP_MODE=approval 이면 신규는 pending(옛 승인제), 활성 사용자가 상한(MAX_ACTIVE_USERS) 이상이면 신규는 pending.
//  - 기존 사용자의 상태는 로그인이 바꾸지 않는다 (다른 관리자의 대기·차단 결정을 흔적 없이 뒤집지 않기 위해). 관리자 역할만 보장한다.
import { isAuthProviderId, isBootstrapAdmin, normalizeEmail } from "./admin-emails.ts";

export type UserStatus = "active" | "pending" | "blocked";
export type UserRole = "admin" | "member";
export type SignupMode = "open" | "approval";

export const DEFAULT_MAX_ACTIVE_USERS = 200;

/** SIGNUP_MODE: 미설정·빈 값은 open, 허용 목록 밖의 값은 안전하게 approval. */
export function parseSignupMode(raw: string | undefined): SignupMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "open") return "open";
  return "approval";
}

/** MAX_ACTIVE_USERS: 1 이상 1,000,000 이하 정수, 그 밖(미설정 포함)은 기본 200. */
export function parseMaxActiveUsers(raw: string | undefined): number {
  const value = (raw ?? "").trim();
  if (!/^\d{1,7}$/.test(value)) return DEFAULT_MAX_ACTIVE_USERS;
  const n = Number(value);
  return n >= 1 && n <= 1_000_000 ? n : DEFAULT_MAX_ACTIVE_USERS;
}

export interface ProvisionInput {
  provider: string;
  accountId: string | null | undefined;
  /** 공급자가 준 이메일. Google 은 검증된 경우에만, Kakao 는 항상 null 로 들어온다. */
  email: string | null | undefined;
  /** (공급자, 계정 id) 로 이미 연결된 사용자 */
  linked: { status: UserStatus; role: UserRole } | null;
  /** 연결된 수단이 없을 때, 같은 이메일을 가진 기존 사용자 (호출하는 쪽이 canLinkByEmail 일 때만 찾는다) */
  emailMatch: { status: UserStatus; role: UserRole } | null;
  adminEmailsRaw: string | undefined;
  /** 신규 가입 방식 (parseSignupMode 결과) */
  signupMode: SignupMode;
  /** 활성 사용자 수가 상한 이상인지 (신규 생성 때만 의미가 있다) */
  capacityFull: boolean;
}

export type ProvisionDecision =
  | { deny: true; reason: "blocked" | "invalid_account" | "unsupported_provider" }
  | {
      deny: false;
      /** login: 연결된 사용자로 로그인, link: 이메일이 같은 기존 사용자에 이 수단을 연결, create: 새 사용자 */
      action: "login" | "link" | "create";
      /** create 일 때 처음 상태. 그 외에는 지금 상태 그대로 */
      status: "active" | "pending";
      /** create 일 때 처음 상태의 이유 (감사 기록용) */
      reason?: "admin_email" | "open" | "approval_mode" | "capacity";
      /** 관리자 역할을 보장해야 하는지 (ADMIN_EMAILS + 신뢰 공급자) */
      ensureAdmin: boolean;
    };

/** 이메일로 기존 사용자에 연결해도 되는 공급자인지. Kakao 는 이메일 검증 여부를 알 수 없어 연결하지 않는다. */
export function canLinkByEmail(provider: string, email: string | null | undefined): boolean {
  if (provider !== "google" && provider !== "credentials") return false;
  return normalizeEmail(email) !== null;
}

export function decideProvision(input: ProvisionInput): ProvisionDecision {
  if (!isAuthProviderId(input.provider)) return { deny: true, reason: "unsupported_provider" };
  if (typeof input.accountId !== "string" || input.accountId.trim().length === 0) {
    return { deny: true, reason: "invalid_account" };
  }
  const ensureAdmin = isBootstrapAdmin({ email: input.email, provider: input.provider, adminEmailsRaw: input.adminEmailsRaw });

  if (input.linked) {
    if (input.linked.status === "blocked") return { deny: true, reason: "blocked" };
    return { deny: false, action: "login", status: input.linked.status, ensureAdmin };
  }

  const match = canLinkByEmail(input.provider, input.email) ? input.emailMatch : null;
  if (match) {
    if (match.status === "blocked") return { deny: true, reason: "blocked" };
    return { deny: false, action: "link", status: match.status, ensureAdmin };
  }

  if (ensureAdmin) return { deny: false, action: "create", status: "active", ensureAdmin, reason: "admin_email" };
  if (input.signupMode === "approval") return { deny: false, action: "create", status: "pending", ensureAdmin, reason: "approval_mode" };
  if (input.capacityFull) return { deny: false, action: "create", status: "pending", ensureAdmin, reason: "capacity" };
  return { deny: false, action: "create", status: "active", ensureAdmin, reason: "open" };
}
