import type { Metadata } from "next";
import { Download, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { signOutAction } from "@/components/auth/actions";
import { DeleteAllForm } from "@/components/shared/delete-all-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DisplayNameForm } from "@/components/settings/display-name-form";
import { deleteAccountAction, deleteAllDataAction, updateDisplayNameAction } from "@/lib/actions/account";
import { ACCOUNT_DELETE_PHRASE, DELETE_CONFIRM_PHRASE } from "@/lib/actions/state";
import { db } from "@/lib/db/pool";
import { getDisplayName } from "@/lib/db/queries/users";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "설정" };

// 이름 관문 예외(allowNoName): 이름 입력을 원하지 않는 사용자도 여기서 표시 이름을 정하거나 데이터·계정을 직접 삭제할 수 있어야 한다.
// 이 화면은 본인 계정 정보·표시 이름·삭제만 다룬다(내보내기 링크는 이름 관문이 있는 /app/export 로 간다).
export default async function SettingsPage() {
  const viewer = await requireActiveUser("/app/settings", { allowNoName: true });
  const displayName = await getDisplayName(db, viewer.id);
  return (
    <>
      <PageHeader eyebrow="계정 · 데이터" title="설정" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>계정</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[5.5rem_1fr] text-sm [&>dd]:border-b [&>dd]:border-line [&>dd]:py-2.5 [&>dt]:border-b [&>dt]:border-line [&>dt]:py-2.5">
              <dt className="text-muted">이름</dt>
              <dd className="font-medium">{viewer.name ?? "— (로그인 공급자가 이름을 주지 않았습니다)"}</dd>
              <dt className="text-muted">이메일</dt>
              <dd className="break-all">{viewer.email ?? "— (카카오 로그인은 이메일을 받지 않습니다)"}</dd>
              <dt className="text-muted">권한</dt>
              <dd>
                <Badge tone={viewer.role === "admin" ? "brand" : "neutral"}>{viewer.role === "admin" ? "관리자" : "회원"}</Badge>
              </dd>
            </dl>
            <div className="mt-5">
              <DisplayNameForm action={updateDisplayNameAction} current={displayName} />
            </div>
            <form action={signOutAction} className="mt-5">
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
            <p className="text-sm text-muted">지난 달 기록: 보관한 고정지출은 대시보드 「내역」의 지난 달에는 남지만, 공유 링크에는 기간과 상관없이 나오지 않습니다.</p>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            <a href="/app/export/fixed" className={buttonClass("secondary", "md")} download>
              <Download aria-hidden="true" className="size-4" />
              고정지출 CSV
            </a>
            <a href="/app/export/balances" className={buttonClass("secondary", "md")} download>
              <Download aria-hidden="true" className="size-4" />
              자산·부채 CSV
            </a>
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="danger-zone" className="mt-10 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="size-4 text-danger" />
          <h2 id="danger-zone" className="text-lg text-danger">
            위험 구역
          </h2>
          <span className="text-sm text-muted">· 되돌릴 수 없는 작업</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle>내 데이터 전체 삭제</CardTitle>
            <p className="text-sm text-muted">고정지출(달별 변경 포함)·예정지출·자산/부채·공유 링크를 모두 지웁니다. 되돌릴 수 없습니다. 로그인 계정은 남습니다.</p>
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
      </section>
    </>
  );
}
