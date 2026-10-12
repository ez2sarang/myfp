// Auth.js v5 설정 (JWT 세션, 공급자: Google, Kakao, 선택적 비상용 Credentials). 서버 전용.
//  - OAuth 액세스·리프레시·ID 토큰은 저장하지 않는다 (누가 로그인했는지만 필요). 세션 JWT 에는 DB 사용자 id(uid)만 담는다.
//  - 이름·이메일·상태·역할은 요청마다 DB 에서 읽는다 (src/lib/session.ts).
//  - Auth.js 의 allowDangerousEmailAccountLinking 은 쓰지 않는다. 연결 규칙은 우리 쪽(auth-core/provision.ts)에 있다:
//    Google 의 검증된 이메일(또는 비상용 관리자 로그인)만 같은 이메일의 기존 사용자에 연결되고, Kakao 는 이메일을 쓰지 않아 연결되지 않는다.
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { safeRedirectTarget } from "@/lib/auth-core/callback-url";
import { normalizeEmail } from "@/lib/auth-core/admin-emails";
import { SESSION_COOKIE } from "@/lib/auth-core/cookie";
import { authorizeAdminCredentials, credentialsEnabled, type CredentialEnv } from "@/lib/auth-core/credentials";
import { googleProfileToUser } from "@/lib/auth-core/google-profile";
import { hashPassword, verifyPassword } from "@/lib/auth-core/password";
import { createAttemptLimiter } from "@/lib/auth-core/rate-limit";
import { db, withTransaction } from "@/lib/db/pool";
import { findUserId, provisionUser } from "@/lib/db/queries/provision";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
  }
}

function credentialEnv(): CredentialEnv {
  return {
    enabled: process.env.AUTH_ENABLE_CREDENTIALS,
    adminEmails: process.env.ADMIN_EMAILS,
    passwordHash: process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH,
  };
}

const credentialLimiter = createAttemptLimiter({ maxFailures: 5, windowMs: 15 * 60 * 1000 });
let dummyHashPromise: Promise<string> | undefined;
const dummyHash = (): Promise<string> => (dummyHashPromise ??= hashPassword(`dummy-${Math.random().toString(36).slice(2)}-password`));
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function clientKeys(request: Request | undefined): string[] {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request?.headers.get("x-real-ip")?.trim();
  const ip = (forwarded || real || "").slice(0, 64);
  return ip ? [`ip:${ip}`] : [];
}

// Auth.js 가 공급자 토큰을 다루더라도 우리 쪽에서는 아무것도 저장·전달하지 않는다.
const noTokens = () => ({});
const checks: ("pkce" | "state")[] = ["pkce", "state"];

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, max);
  return text.length > 0 ? text : null;
}

function cleanImage(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("https://") && value.length <= 500 ? value : null;
}

const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    checks,
    account: noTokens,
    // 검증되지 않은 이메일은 버린다 (관리자 판정에도 쓰이지 않는다). 규칙은 auth-core/google-profile.ts 에 있다.
    profile(profile) {
      return googleProfileToUser(profile);
    },
  }),
  Kakao({
    clientId: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    checks,
    account: noTokens,
    profile(profile) {
      return {
        id: String(profile.id),
        name: profile.kakao_account?.profile?.nickname ?? null,
        email: null,
        image: profile.kakao_account?.profile?.profile_image_url ?? null,
      };
    },
  }),
  ...(credentialsEnabled(credentialEnv())
    ? [
        Credentials({
          id: "credentials",
          name: "관리자 로그인",
          credentials: { email: { label: "이메일", type: "email" }, password: { label: "비밀번호", type: "password" } },
          async authorize(credentials, request) {
            const result = await authorizeAdminCredentials({
              email: credentials?.email,
              password: credentials?.password,
              clientKeys: clientKeys(request),
              env: credentialEnv(),
              limiter: credentialLimiter,
              verify: verifyPassword,
              dummyHash,
              delay,
            });
            return result.ok ? { id: result.email, email: result.email, name: "관리자" } : null;
          },
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  pages: { signIn: "/login", error: "/login" },
  cookies: { sessionToken: SESSION_COOKIE },
  useSecureCookies: SESSION_COOKIE.options.secure,
  // 오류 객체의 메시지·cause 에는 OAuth 코드나 프로필 정보가 들어올 수 있어 오류 이름만 남긴다.
  logger: { error: (error) => console.error("[auth]", error?.name ?? "Error"), warn: () => undefined, debug: () => undefined },
  callbacks: {
    async signIn({ user, account }) {
      if (!account) return false;
      if (account.provider === "credentials" && !credentialsEnabled(credentialEnv())) return false;
      const email = account.provider === "kakao" ? null : normalizeEmail(user.email);
      const outcome = await withTransaction((tx) =>
        provisionUser(tx, {
          provider: account.provider,
          accountId: account.providerAccountId,
          email,
          name: cleanText(user.name, 100),
          image: cleanImage(user.image),
          adminEmailsRaw: process.env.ADMIN_EMAILS,
          signupModeRaw: process.env.SIGNUP_MODE,
          maxActiveUsersRaw: process.env.MAX_ACTIVE_USERS,
        }),
      );
      return outcome.allowed;
    },
    async jwt({ token, account }) {
      // 로그인 직후에만 DB 사용자 id 를 찾아 토큰을 새로 만든다 (이름·이메일·이미지는 담지 않는다).
      if (account) {
        const uid = await findUserId(db, account.provider, account.providerAccountId);
        return uid ? { uid, sub: uid } : {};
      }
      return token;
    },
    async session({ session, token }) {
      const uid = typeof token.uid === "string" ? token.uid : undefined;
      // 사용자 정보는 id 하나뿐이다. id 가 없으면 로그인하지 않은 것으로 본다.
      return { expires: session.expires, user: uid ? { id: uid } : undefined } as typeof session;
    },
    async redirect({ url, baseUrl }) {
      return `${baseUrl}${safeRedirectTarget(url, baseUrl)}`;
    },
  },
});
