// Google 프로필 → Auth.js 사용자 변환 (순수 모듈).
// 이메일은 email_verified 가 boolean true 일 때만 사용한다. false, 누락, 문자열 "true"/"false" 같은 값은 모두 미검증으로 보고 버린다.
// 이메일이 null 이면 ADMIN_EMAILS 와 일치해도 관리자 후보가 되지 않는다 (admin-emails.ts 의 isBootstrapAdmin).

import { normalizeEmail } from "./admin-emails.ts";

/** Google OIDC 프로필 중 쓰는 필드. 값의 형식은 신뢰하지 않으므로 모두 unknown 으로 받는다. */
export interface GoogleProfileLike {
  sub: string;
  name?: unknown;
  email?: unknown;
  email_verified?: unknown;
  picture?: unknown;
}

export interface GoogleUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export function googleProfileToUser(profile: GoogleProfileLike): GoogleUser {
  return {
    id: profile.sub,
    name: typeof profile.name === "string" ? profile.name : null,
    email: profile.email_verified === true ? normalizeEmail(profile.email) : null,
    image: typeof profile.picture === "string" ? profile.picture : null,
  };
}
