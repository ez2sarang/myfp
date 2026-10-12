import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { InlineAction } from "@/components/forms/inline-action";
import { Badge } from "@/components/ui/badge";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { setUserStatusAction } from "@/lib/actions/admin";
import { ADMIN_PAGE_SIZE, formatSeoulDateTime, parsePage, providerLabel, shortUserId, userPrimaryLabel } from "@/lib/admin/user-label";
import { db } from "@/lib/db/pool";
import { countUsersByStatus, listUsers } from "@/lib/db/queries/users";
import { buttonClass } from "@/components/ui/button";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "사용자 관리" };

const STATUS_LABEL = { active: "활성", pending: "가입 대기", blocked: "차단" } as const;
const STATUS_TONE = { active: "positive", pending: "warn", blocked: "negative" } as const;
const STATUS_DOT = { active: "bg-positive", pending: "bg-warn-ink", blocked: "bg-negative" } as const;

// 사용자 목록: 가입일 최신순 50명씩. 사용자를 구분하는 최소 정보(로그인 수단·짧은 id·가입/마지막 로그인·이름/이메일)와 등록 항목 수만 보여 준다.
// 등록 항목은 개수만 세고 금액·이름·메모는 조회하지 않는다(src/lib/db/queries/users.ts listUsers).
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const page = parsePage((await searchParams).page);
  const [users, counts] = await Promise.all([listUsers(db, { limit: ADMIN_PAGE_SIZE, offset: (page - 1) * ADMIN_PAGE_SIZE }), countUsersByStatus(db)]);
  const total = counts.active + counts.pending + counts.blocked;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  return (
    <>
      <PageHeader
        eyebrow="관리자"
        title="사용자 관리"
        description="가입 대기(가입 상한 초과·승인제 모드에서 생김)를 처리하거나 계정을 차단·해제합니다. 자기 자신과 마지막 관리자는 차단할 수 없습니다. 시각은 서울 시간입니다."
      />
      <dl className="mb-6 grid grid-cols-3 gap-3 sm:max-w-xl">
        {(["active", "pending", "blocked"] as const).map((s) => (
          <div key={s} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3 shadow-card">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_DOT[s]}`} />
              {STATUS_LABEL[s]}
            </dt>
            <dd className="num text-2xl font-semibold tracking-[-0.03em]">{counts[s]}</dd>
          </div>
        ))}
      </dl>
      <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "사용자 목록" }}>
        <THead>
          <TR>
            <TH>사용자</TH>
            <TH>로그인 수단</TH>
            <TH>상태</TH>
            <TH>권한</TH>
            <TH>등록 항목 수</TH>
            <TH>가입 · 마지막 로그인</TH>
            <TH>
              <span className="sr-only">동작</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {users.map((u) => {
            const label = userPrimaryLabel(u);
            // 대표 이름 아래에 대표 이름으로 쓰지 않은 공급자 이름·이메일을 덧붙인다
            const details = [u.displayName && u.name ? `공급자 이름 ${u.name}` : null, u.email && (u.displayName || u.name) ? u.email : null].filter(
              (d): d is string => d !== null,
            );
            return (
              <TR key={u.id}>
                <TD>
                  <span className="font-medium">{label}</span>
                  {u.displayName ? <span className="ml-1.5 text-[0.7rem] text-muted">(표시 이름)</span> : null}
                  {details.map((d) => (
                    <span key={d} className="block break-all text-xs text-muted">
                      {d}
                    </span>
                  ))}
                  <span className="num block text-xs text-muted">#{shortUserId(u.id)}</span>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {u.providers.length > 0 ? (
                      u.providers.map((p) => (
                        <Badge key={p} tone={p === "credentials" ? "warn" : "neutral"}>
                          {providerLabel(p)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted">연결 없음</span>
                    )}
                  </div>
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                </TD>
                <TD>{u.role === "admin" ? "관리자" : "회원"}</TD>
                <TD className="num whitespace-nowrap text-xs">
                  고정지출 {u.counts.fixed} · 자산/부채 {u.counts.balances} · 공유 {u.counts.activeShares}
                </TD>
                <TD className="num whitespace-nowrap text-xs">
                  {formatSeoulDateTime(u.createdAt)}
                  <span className="block text-muted">{u.lastLoginAt ? formatSeoulDateTime(u.lastLoginAt) : "로그인 기록 없음"}</span>
                </TD>
                <TD>
                  {u.id === admin.id ? (
                    <span className="text-xs text-muted">나</span>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-2">
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
      {pages > 1 ? (
        <nav aria-label="사용자 목록 페이지" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/admin/users?page=${page - 1}`} className={buttonClass("secondary", "sm")}>
              이전
            </Link>
          ) : (
            <span />
          )}
          <span className="num text-muted">
            {page} / {pages} 쪽 · 전체 {total}명
          </span>
          {page < pages ? (
            <Link href={`/admin/users?page=${page + 1}`} className={buttonClass("secondary", "sm")}>
              다음
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
