import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/components/auth/actions";
import { WelcomeNameForm } from "@/components/settings/welcome-name-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { updateDisplayNameAction } from "@/lib/actions/account";
import { WELCOME_PATH, welcomeNext } from "@/lib/auth-core/name-gate";
import { requireActiveUser, viewerHasUsableName } from "@/lib/session";

export const metadata: Metadata = { title: "이름 입력", robots: { index: false, follow: false } };

type Params = Promise<Record<string, string | string[] | undefined>>;

// 이름 관문: 쓸 수 있는 이름(직접 정한 이름·로그인 공급자 이름)이 없는 활성 사용자는 서비스를 쓰기 전에 여기서 이름을 정한다.
// 이 화면은 이름 관문을 건너뛰는 가드 변형(allowNoName)을 쓴다 — 리다이렉트 루프 없음. 이미 이름이 있으면 돌아갈 곳으로 보낸다.
// 돌아갈 곳(next)은 같은 사이트 내부 경로만(welcomeNext → safeCallbackPath), 그 밖은 /app.
export default async function WelcomePage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const next = welcomeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const viewer = await requireActiveUser(`${WELCOME_PATH}?next=${encodeURIComponent(next)}`, { allowNoName: true });
  if (await viewerHasUsableName(viewer.id)) redirect(next);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 py-4 sm:py-10">
      <Card className="shadow-raised">
        <CardHeader>
          <h1 className="text-xl font-semibold tracking-tight">사용하기 전에 이름을 알려 주세요</h1>
          <p className="text-sm leading-relaxed text-muted">
            관리자 화면에서 가입자를 구분하는 데 쓰입니다. 다른 회원에게는 보이지 않습니다(함께 보기에서는 따로 정하는 태그만 보입니다). 별명도 괜찮고, 설정에서 언제든 바꿀 수
            있어요.
          </p>
        </CardHeader>
        <CardBody>
          <WelcomeNameForm action={updateDisplayNameAction} next={next} />
        </CardBody>
      </Card>
      <form action={signOutAction} className="self-center">
        <Button type="submit" variant="ghost" size="sm" className="min-h-11">
          로그아웃
        </Button>
      </form>
      <p className="text-center text-xs text-muted">
        이름을 입력하지 않고 나가려면{" "}
        <Link href="/app/settings#account-delete-confirm" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink">
          설정
        </Link>
        에서 계정을 삭제할 수 있습니다.
      </p>
    </div>
  );
}
