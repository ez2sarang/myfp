import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { InlineAction } from "@/components/forms/inline-action";
import { SubmitButton } from "@/components/forms/submit-button";
import { CreateHouseholdForm, InviteCreator, MembershipForm } from "@/components/household/household-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { deleteHouseholdAction, leaveHouseholdAction, removeMemberAction, renameHouseholdAction, revokeInviteAction } from "@/lib/actions/household";
import { db } from "@/lib/db/pool";
import { getMembership, listInvites, visibleToViewer } from "@/lib/db/queries/household";
import { seoulToday } from "@/lib/finance/dates";
import { formatDate } from "@/lib/finance/format";
import { HOUSEHOLD_NAME_MAX, MAX_ACTIVE_INVITES, MAX_MEMBERS } from "@/lib/household/rules";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "함께 보기 설정" };

// 그룹 설정: 만들기·이름 변경(방장), 초대 링크(방장, 단회·7일·최대 5개), 구성원 목록과 내 태그·내놓을 범위, 내보내기(방장), 나가기, 그룹 지우기(방장).
export default async function HouseholdSettingsPage() {
  const viewer = await requireActiveUser("/app/household/settings");
  const membership = await getMembership(db, viewer.id);
  if (!membership) {
    return (
      <>
        <PageHeader eyebrow="함께 보기" title="그룹 만들기" description="가족·동거인과 서로 동의한 범위만 합산해 봅니다. 한 사람은 한 그룹에만 들어갈 수 있고, 그룹은 최대 6명입니다." />
        <Card>
          <CardBody>
            <CreateHouseholdForm />
            <p className="mt-4 text-sm text-muted">초대 링크를 받았다면 그 링크를 열면 됩니다.</p>
          </CardBody>
        </Card>
      </>
    );
  }
  const [data, invites] = await Promise.all([visibleToViewer(db, viewer.id), membership.role === "owner" ? listInvites(db, viewer.id) : Promise.resolve([])]);
  const members = data?.members ?? [];
  const isOwner = membership.role === "owner";
  const now = Date.now();
  const activeInvites = invites.filter((i) => i.usedAt === null && i.expiresAt.getTime() > now).length;
  return (
    <>
      <PageHeader
        eyebrow="함께 보기 · 설정"
        title={membership.householdName}
        description={isOwner ? "이 그룹의 방장입니다." : "이 그룹의 구성원입니다."}
        actions={
          <Link href="/app/household" className="text-sm font-medium text-brand underline underline-offset-4">
            합산 보기로
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>내 설정</CardTitle>
          </CardHeader>
          <CardBody>
            <MembershipForm tag={membership.tag} fixed={membership.shareFixed} balances={membership.shareBalances} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              구성원 <span className="num text-sm font-normal text-muted">({members.length}/{MAX_MEMBERS})</span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "구성원 목록" }}>
              <THead>
                <TR>
                  <TH>태그</TH>
                  <TH>역할</TH>
                  <TH>내놓은 것</TH>
                  <TH>
                    <span className="sr-only">동작</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {members.map((m) => (
                  <TR key={m.key}>
                    <TD className="font-medium">
                      {m.tag} {m.isSelf ? <span className="text-xs text-muted">(나)</span> : null}
                    </TD>
                    <TD>{m.role === "owner" ? <Badge tone="brand">방장</Badge> : "구성원"}</TD>
                    <TD className="text-xs">{[m.shareFixed ? "고정지출" : null, m.shareBalances ? "자산·부채" : null].filter(Boolean).join(", ") || "없음"}</TD>
                    <TD>
                      {isOwner && !m.isSelf ? (
                        <InlineAction
                          action={removeMemberAction}
                          hidden={{ tag: m.tag }}
                          label="내보내기"
                          variant="danger"
                          confirmText={`「${m.tag}」 님을 그룹에서 내보낼까요? 그 사람의 항목이 즉시 합산에서 빠집니다.`}
                        />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      {isOwner ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>초대</CardTitle>
              <p className="text-sm text-muted">초대 링크는 7일 동안 한 번만 쓸 수 있고, 사용 중인 초대는 최대 {MAX_ACTIVE_INVITES}개입니다.</p>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <InviteCreator disabled={members.length >= MAX_MEMBERS || activeInvites >= MAX_ACTIVE_INVITES} />
              {invites.length > 0 ? (
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {invites.map((i) => {
                    const state = i.usedAt ? "사용됨" : i.expiresAt.getTime() <= now ? "만료" : "사용 가능";
                    return (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="num text-xs text-muted">
                          만든 날 {formatDate(seoulToday(i.createdAt))} · 만료 {formatDate(seoulToday(i.expiresAt))}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge tone={state === "사용 가능" ? "positive" : "neutral"}>{state}</Badge>
                          {state === "사용 가능" ? <InlineAction action={revokeInviteAction} hidden={{ id: i.id }} label="취소" variant="ghost" /> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>그룹 이름</CardTitle>
            </CardHeader>
            <CardBody>
              <ActionForm action={renameHouseholdAction}>
                <Input name="name" defaultValue={membership.householdName} maxLength={HOUSEHOLD_NAME_MAX * 2} aria-label="그룹 이름" className="max-w-xs" required />
                <SubmitButton variant="primary" size="md">
                  이름 바꾸기
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <section aria-labelledby="household-danger" className="mt-10 flex flex-col gap-3">
        <h2 id="household-danger" className="text-lg text-danger">
          나가기·지우기
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <InlineAction
            action={leaveHouseholdAction}
            hidden={{}}
            label="그룹 나가기"
            variant="danger"
            confirmText={isOwner ? "그룹에서 나갈까요? 방장은 가장 먼저 들어온 구성원에게 넘어가고, 남는 사람이 없으면 그룹이 지워집니다." : "그룹에서 나갈까요? 내 항목이 즉시 합산에서 빠집니다."}
          />
          {isOwner ? (
            <InlineAction action={deleteHouseholdAction} hidden={{}} label="그룹 지우기" variant="danger" confirmText="그룹을 지울까요? 모든 구성원이 그룹에서 빠지고 초대도 지워집니다. 각자의 데이터는 그대로입니다." />
          ) : null}
        </div>
      </section>
    </>
  );
}
