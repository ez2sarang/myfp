import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BrandMark } from "@/components/brand-mark";
import { AcceptInviteForm } from "@/components/household/household-forms";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/pool";
import { findInvite, getMembership } from "@/lib/db/queries/household";
import { requireActiveUser } from "@/lib/session";
import { SITE_NAME } from "@/lib/site";
import { hashShareToken, isWellFormedToken } from "@/lib/share/token";

export const metadata: Metadata = { title: "그룹 초대", robots: { index: false, follow: false } };

// 그룹 초대 수락 화면. 로그인한 활성 계정만(가입 대기·차단은 안내 화면으로). 형식 오류·없음·사용됨·만료 초대는 모두 같은 404.
// 이미 다른 그룹에 속해 있으면 안내만 한다. 수락은 서버 액션이 다시 검증한다(토큰·동의·태그·범위·인원·단회).
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const viewer = await requireActiveUser(`/join/${isWellFormedToken(token) ? token : ""}`);
  if (!isWellFormedToken(token)) notFound();
  const invite = await findInvite(db, hashShareToken(token));
  if (!invite) notFound();
  const membership = await getMembership(db, viewer.id);
  return (
    <main id="main" className="wrap flex min-h-dvh max-w-xl flex-col justify-center gap-6 py-12">
      <Link href="/app" className="flex items-center gap-2 font-semibold">
        <BrandMark className="size-7" />
        {SITE_NAME}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>「{invite.householdName}」 그룹 초대</CardTitle>
          <p className="text-sm text-muted">
            함께 보기 그룹에 들어가면 구성원끼리 각자 내놓은 고정지출·자산/부채를 합산해 볼 수 있습니다. 메모·기관/카드명·결제수단과 「나만 보기」 항목은 어떤 경우에도
            보이지 않고, 운영자도 그룹 내용을 보지 않습니다.
          </p>
        </CardHeader>
        <CardBody>
          {membership ? (
            <p role="note" className="rounded-lg border border-line bg-info-bg px-4 py-3 text-sm text-info-ink">
              이미 「{membership.householdName}」 그룹에 속해 있습니다. 한 사람은 한 그룹에만 들어갈 수 있으니, 먼저{" "}
              <Link href="/app/household/settings" className="font-semibold underline underline-offset-4">
                그룹 설정
              </Link>
              에서 나간 뒤 다시 이 링크를 여세요.
            </p>
          ) : (
            <AcceptInviteForm token={token} householdName={invite.householdName} />
          )}
        </CardBody>
      </Card>
    </main>
  );
}
