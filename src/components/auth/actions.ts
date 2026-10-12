"use server";

// 로그인·로그아웃 서버 액션. 모든 액션은 assertSameOrigin(Origin 필수, 같은 사이트만)으로 시작한다. 돌아갈 경로는 항상 safeCallbackPath 를 거쳐 같은 사이트의 상대 경로만 쓴다.
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";
import { buildLoginErrorUrl, safeCallbackPath } from "@/lib/auth-core/callback-url";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";

function text(formData: FormData, key: string, max = 512): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.slice(0, max) : "";
}

export async function signInWithProvider(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const provider = text(formData, "provider", 20);
  if (provider !== "google" && provider !== "kakao") redirect("/login?error=Configuration");
  await signIn(provider, { redirectTo: safeCallbackPath(text(formData, "callbackUrl")) });
}

export async function signInWithCredentials(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const redirectTo = safeCallbackPath(text(formData, "callbackUrl"));
  try {
    await signIn("credentials", {
      email: text(formData, "email", 254),
      password: text(formData, "password", 1024),
      redirectTo,
    });
  } catch (error) {
    // 인증 실패는 로그인 화면의 한국어 오류로 돌려보낸다. 리다이렉트 신호 등 그 밖의 예외는 그대로 던진다.
    if (error instanceof AuthError) redirect(buildLoginErrorUrl("CredentialsSignin", redirectTo));
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await assertSameOrigin();
  await signOut({ redirectTo: "/" });
}
