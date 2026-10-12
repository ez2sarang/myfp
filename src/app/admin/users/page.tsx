import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { InlineAction } from "@/components/forms/inline-action";
import { Badge } from "@/components/ui/badge";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { setUserStatusAction } from "@/lib/actions/admin";
import { db } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/queries/users";
import { seoulToday } from "@/lib/finance/dates";
import { formatDate } from "@/lib/finance/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "사용자 관리" };

const STATUS_LABEL = { active: "활성", pending: "승인 대기", blocked: "차단" } as const;
const STATUS_TONE = { active: "positive", pending: "warn", blocked: "negative" } as const;

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const users = await listUsers(db);
  return (
    <>
      <PageHeader title="사용자 관리" description="가입 신청을 승인하거나 계정을 차단합니다. 자기 자신과 마지막 관리자는 차단할 수 없습니다." />
      <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "사용자 목록" }}>
        <THead>
          <TR>
            <TH>사용자</TH>
            <TH>로그인 수단</TH>
            <TH>상태</TH>
            <TH>권한</TH>
            <TH>가입 · 마지막 로그인</TH>
            <TH>
              <span className="sr-only">동작</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {users.map((u) => {
            const label = u.name ?? u.email ?? u.id.slice(0, 8);
            return (
              <TR key={u.id}>
                <TD>
                  <span className="font-medium">{u.name ?? "(이름 없음)"}</span>
                  <span className="block text-xs text-muted">{u.email ?? "이메일 없음"}</span>
                </TD>
                <TD className="text-xs">{u.providers.join(", ") || "연결 없음"}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                </TD>
                <TD>{u.role === "admin" ? "관리자" : "회원"}</TD>
                <TD className="text-xs">
                  {formatDate(seoulToday(u.createdAt))} · {u.lastLoginAt ? formatDate(seoulToday(u.lastLoginAt)) : "—"}
                </TD>
                <TD>
                  {u.id === admin.id ? (
                    <span className="text-xs text-muted">나</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {u.status !== "active" ? (
                        <InlineAction action={setUserStatusAction} hidden={{ userId: u.id, status: "active" }} label={u.status === "pending" ? "승인" : "차단 해제"} variant="primary" ariaLabel={`${label} 승인`} />
                      ) : null}
                      {u.status !== "blocked" ? (
                        <InlineAction
                          action={setUserStatusAction}
                          hidden={{ userId: u.id, status: "blocked" }}
                          label="차단"
                          variant="danger"
                          confirmText={`${label} 계정을 차단할까요?`}
                          ariaLabel={`${label} 차단`}
                        />
                      ) : null}
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </>
  );
}
