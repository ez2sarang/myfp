import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { InlineAction } from "@/components/forms/inline-action";
import { ShareCreateForm } from "@/components/share/share-create-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { createShareAction, revokeShareAction } from "@/lib/actions/share";
import { db } from "@/lib/db/pool";
import { listShareLinks } from "@/lib/db/queries/share";
import { seoulToday } from "@/lib/finance/dates";
import { formatDate } from "@/lib/finance/format";
import { LIMITS } from "@/lib/finance/types";
import { SHARE_SCOPE_LABELS } from "@/lib/share/options";
import { shareLinkState } from "@/lib/share/token";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "공유 링크" };

const STATE_LABEL = { active: "사용 중", expired: "만료", revoked: "폐기" } as const;
const STATE_TONE = { active: "positive", expired: "neutral", revoked: "negative" } as const;

export default async function SharePage() {
  const viewer = await requireActiveUser("/app/share");
  const links = await listShareLinks(db, viewer.id);
  const now = new Date();
  const activeCount = links.filter((l) => shareLinkState(l, now) === "active").length;

  return (
    <>
      <PageHeader
        title="공유 링크"
        description={`읽기 전용 링크입니다. 공유 링크는 myfp 에 가입(로그인)한 사람만 열 수 있습니다. 링크를 받은 사람은 가입(로그인)만 하면 바로 볼 수 있고, 링크를 아는 회원은 다시 전달할 수 있으니 신뢰하는 사람에게만 보내세요. 링크는 언제든 폐기할 수 있습니다. 사용 중인 링크는 최대 ${LIMITS.activeShareLinks}개 (지금 ${activeCount}개).`}
      />
      <Card>
        <CardHeader>
          <CardTitle>새 링크 만들기</CardTitle>
        </CardHeader>
        <CardBody>
          <ShareCreateForm action={createShareAction} disabled={activeCount >= LIMITS.activeShareLinks} />
        </CardBody>
      </Card>

      <h2 className="mb-1 mt-8 text-xl">내 링크</h2>
      <p className="mb-3 text-xs text-muted">열람 수는 로그인한 사람(나 자신 제외)이 연 횟수입니다. 누가 열었는지는 기록하지 않습니다.</p>
      {links.length === 0 ? (
        <EmptyState title="만든 링크가 없습니다" />
      ) : (
        <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "공유 링크 목록" }}>
          <THead>
            <TR>
              <TH>이름</TH>
              <TH>상태</TH>
              <TH>포함</TH>
              <TH>가림</TH>
              <TH>만든 날 · 만료</TH>
              <TH className="text-right">열람</TH>
              <TH>마지막 열람</TH>
              <TH>
                <span className="sr-only">동작</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {links.map((l) => {
              const state = shareLinkState(l, now);
              return (
                <TR key={l.id}>
                  <TD className="font-medium">{l.label}</TD>
                  <TD>
                    <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
                  </TD>
                  <TD className="whitespace-normal text-xs">{l.scopes.map((s) => SHARE_SCOPE_LABELS[s]).join(", ") || "—"}</TD>
                  <TD className="whitespace-normal text-xs">
                    {[l.masks.amounts ? "금액" : null, l.masks.details ? "메모·기관" : null].filter(Boolean).join(", ") || "없음"}
                  </TD>
                  <TD className="text-xs">
                    {formatDate(seoulToday(l.createdAt))} · {l.expiresAt ? formatDate(seoulToday(l.expiresAt)) : "무기한"}
                  </TD>
                  <TD className="text-right">{l.viewCount}</TD>
                  <TD className="text-xs">{l.lastViewedAt ? formatDate(seoulToday(l.lastViewedAt)) : "—"}</TD>
                  <TD>
                    {state === "active" ? (
                      <InlineAction
                        action={revokeShareAction}
                        hidden={{ id: l.id }}
                        label="즉시 폐기"
                        variant="danger"
                        confirmText={`「${l.label}」 링크를 폐기할까요? 이 링크로는 더 이상 볼 수 없습니다.`}
                        ariaLabel={`${l.label} 폐기`}
                      />
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
