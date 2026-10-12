import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { signOutAction } from "@/components/auth/actions";
import { DeleteAllForm } from "@/components/shared/delete-all-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteAccountAction, deleteAllDataAction } from "@/lib/actions/account";
import { ACCOUNT_DELETE_PHRASE, DELETE_CONFIRM_PHRASE } from "@/lib/actions/state";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "설정" };

export default async function SettingsPage() {
  const viewer = await requireActiveUser("/app/settings");
  return (
    <>
      <PageHeader title="설정" />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>계정</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">이름</dt>
              <dd>{viewer.name ?? "—"}</dd>
              <dt className="text-muted">이메일</dt>
              <dd>{viewer.email ?? "— (카카오 로그인은 이메일을 받지 않습니다)"}</dd>
              <dt className="text-muted">권한</dt>
              <dd>
                <Badge tone={viewer.role === "admin" ? "brand" : "neutral"}>{viewer.role === "admin" ? "관리자" : "회원"}</Badge>
              </dd>
            </dl>
            <form action={signOutAction} className="mt-4">
              <Button type="submit" variant="secondary">
                로그아웃
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>내보내기</CardTitle>
            <p className="text-sm text-muted">엑셀에서 열 수 있는 CSV 파일로 받습니다.</p>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            <a href="/app/export/fixed" className={buttonClass("secondary", "md")} download>
              고정지출 CSV
            </a>
            <a href="/app/export/balances" className={buttonClass("secondary", "md")} download>
              자산·부채 CSV
            </a>
          </CardBody>
        </Card>

        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle>내 데이터 전체 삭제</CardTitle>
            <p className="text-sm text-muted">고정지출·자산/부채·공유 링크를 모두 지웁니다. 되돌릴 수 없습니다. 로그인 계정은 남습니다.</p>
          </CardHeader>
          <CardBody>
            <DeleteAllForm action={deleteAllDataAction} phrase={DELETE_CONFIRM_PHRASE} />
          </CardBody>
        </Card>

        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle>계정 삭제</CardTitle>
            <p className="text-sm text-muted">
              재무 데이터·순자산 기록·공유 링크·로그인 연결과 계정 자체를 지우고 로그아웃합니다. 되돌릴 수 없습니다. 감사 기록에는 사용자 id 와 지운 건수만 남습니다.
              {viewer.role === "admin" ? " 마지막 관리자 계정은 삭제할 수 없습니다." : ""}
            </p>
          </CardHeader>
          <CardBody>
            <DeleteAllForm action={deleteAccountAction} phrase={ACCOUNT_DELETE_PHRASE} inputId="account-delete-confirm" buttonLabel="계정 삭제" />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
