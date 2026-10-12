import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleIcon, KakaoIcon } from "@/components/auth/provider-icons";
import { signInWithCredentials, signInWithProvider } from "@/components/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeCallbackPath } from "@/lib/auth-core/callback-url";
import { credentialsEnabled } from "@/lib/auth-core/credentials";
import { loginErrorMessage } from "@/lib/auth-core/login-errors";
import { getViewer } from "@/lib/session";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

type Params = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export default async function LoginPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const callbackUrl = safeCallbackPath(first(sp.callbackUrl));
  const error = loginErrorMessage(first(sp.error) || null);

  // 이미 로그인한 사용자는 대시보드로. DB 를 읽지 못해도 로그인 화면은 보여 준다.
  const signedIn = await getViewer()
    .then((v) => v !== null)
    .catch(() => false);
  if (signedIn) redirect("/app");

  const showCredentials = credentialsEnabled({
    enabled: process.env.AUTH_ENABLE_CREDENTIALS,
    adminEmails: process.env.ADMIN_EMAILS,
    passwordHash: process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH,
  });

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <Link href="/" aria-label={`${SITE_NAME} 소개로 돌아가기`}>
          <BrandMark className="size-12" />
        </Link>
        <h1 className="text-3xl">로그인</h1>
        <p className="text-muted">{SITE_TAGLINE}</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-danger bg-negative-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <form action={signInWithProvider}>
          <input type="hidden" name="provider" value="google" />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            type="submit"
            className="flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-[#747775] bg-white px-4 text-base font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f2f2f2]"
          >
            <GoogleIcon />
            Google로 계속하기
          </button>
        </form>
        <form action={signInWithProvider}>
          <input type="hidden" name="provider" value="kakao" />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            type="submit"
            className="flex min-h-11 w-full items-center justify-center gap-3 rounded-md bg-[#FEE500] px-4 text-base font-semibold text-[#191919] transition-colors hover:brightness-95"
          >
            <KakaoIcon />
            카카오로 계속하기
          </button>
        </form>
      </div>

      {showCredentials ? (
        <details className="rounded-md border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">관리자 로그인</summary>
          <form action={signInWithCredentials} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <div className="flex flex-col gap-1">
              <label htmlFor="admin-email" className="text-sm font-medium">
                이메일
              </label>
              <Input id="admin-email" name="email" type="email" autoComplete="username" required maxLength={254} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="admin-password" className="text-sm font-medium">
                비밀번호
              </label>
              <Input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} />
            </div>
            <Button type="submit" variant="primary">
              로그인
            </Button>
            <p className="text-xs text-muted">비상용 로그인입니다. 실패가 반복되면 일정 시간 로그인이 제한됩니다.</p>
          </form>
        </details>
      ) : null}

      <p role="note" className="text-center text-xs text-muted">
        처음 로그인하면 바로 가입되어 내 고정지출·자산을 관리할 수 있습니다. 계속하면{" "}
        <Link href="/terms" className="underline underline-offset-2">
          이용약관
        </Link>
        과{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          개인정보 처리방침
        </Link>
        에 동의하는 것으로 봅니다.
      </p>
    </main>
  );
}
