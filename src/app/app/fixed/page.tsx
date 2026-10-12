import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { FixedForm } from "@/components/fixed/fixed-form";
import { InlineAction } from "@/components/forms/inline-action";
import { ToggleForm } from "@/components/forms/toggle-form";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { archiveFixedAction, createFixedAction, deleteFixedAction, toggleFixedActiveAction } from "@/lib/actions/fixed";
import { db } from "@/lib/db/pool";
import { listFixed } from "@/lib/db/queries/fixed";
import { seoulToday } from "@/lib/finance/dates";
import { formatBillingDay, formatDate, formatKRW } from "@/lib/finance/format";
import { monthlyEquivalent, remainingPayments } from "@/lib/finance/schedule";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_SOURCE_LABELS, LIMITS, PAYMENT_METHOD_LABELS, isOneOf } from "@/lib/finance/types";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "고정지출" };

type Params = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const SORTS = { amount: "금액순", day: "납부일순", name: "이름순" } as const;

function query(params: { category?: string; sort?: string; archived?: string }): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const text = sp.toString();
  return text ? `/app/fixed?${text}` : "/app/fixed";
}

export default async function FixedPage({ searchParams }: { searchParams: Params }) {
  const viewer = await requireActiveUser("/app/fixed");
  const sp = await searchParams;
  const category = isOneOf(EXPENSE_CATEGORIES, first(sp.category)) ? first(sp.category) : "";
  const sort = first(sp.sort) in SORTS ? (first(sp.sort) as keyof typeof SORTS) : "amount";
  const showArchived = first(sp.archived) === "1";
  const today = seoulToday();

  const all = await listFixed(db, viewer.id);
  const rows = all
    .filter((f) => (showArchived ? f.archived : !f.archived))
    .filter((f) => !category || f.category === category)
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ko");
      if (sort === "day") return (a.billingDay ?? 99) - (b.billingDay ?? 99) || a.name.localeCompare(b.name, "ko");
      return monthlyEquivalent(b) - monthlyEquivalent(a);
    });
  const archivedCount = all.filter((f) => f.archived).length;

  return (
    <>
      <PageHeader
        eyebrow={showArchived ? "보관함" : "매달 · 매년"}
        title="고정지출"
        description={`매달·매년 나가는 돈을 관리합니다. 최대 ${LIMITS.fixedExpenses}건.`}
        actions={
          <a href="#add-fixed" className={buttonClass("primary", "sm", "min-h-11 sm:min-h-9")}>
            <Plus aria-hidden="true" className="size-4" />
            새 항목 추가
          </a>
        }
      />

      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-line bg-surface p-3 shadow-card sm:p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="w-8 shrink-0 pt-3 text-xs font-semibold text-muted sm:pt-1.5">
            분류
          </span>
          <nav aria-label="분류 필터" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            <ChipLink href={query({ sort, archived: showArchived ? "1" : "" })} selected={!category} className="min-h-11 sm:min-h-8">
              전체
            </ChipLink>
            {EXPENSE_CATEGORIES.map((c) => (
              <ChipLink key={c} href={query({ category: c, sort, archived: showArchived ? "1" : "" })} selected={category === c} className="min-h-11 sm:min-h-8">
                {EXPENSE_CATEGORY_LABELS[c]}
              </ChipLink>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 text-sm">
          <span className="w-8 shrink-0 text-xs font-semibold text-muted">정렬</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SORTS).map(([key, label]) => (
              <ChipLink key={key} href={query({ category, sort: key, archived: showArchived ? "1" : "" })} selected={sort === key} className="min-h-11 sm:min-h-8">
                {label}
              </ChipLink>
            ))}
          </div>
          <Link
            href={query({ category, sort, archived: showArchived ? "" : "1" })}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-semibold text-brand hover:bg-brand-soft sm:min-h-8"
          >
            {showArchived ? <ArrowLeft aria-hidden="true" className="size-4" /> : <Archive aria-hidden="true" className="size-4" />}
            {showArchived ? "사용 중인 항목 보기" : `보관함 보기 (${archivedCount})`}
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={showArchived ? "보관한 항목이 없습니다" : "항목이 없습니다"} description={showArchived ? undefined : "아래에서 첫 고정지출을 추가해 보세요."} />
      ) : (
        <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "고정지출 목록" }}>
          <THead>
            <TR>
              <TH>활성</TH>
              <TH>이름</TH>
              <TH>분류</TH>
              <TH className="text-right">금액</TH>
              <TH>납부일</TH>
              <TH>결제</TH>
              <TH>종료일 (남은 횟수)</TH>
              <TH>출처</TH>
              <TH>
                <span className="sr-only">동작</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((f) => {
              const left = remainingPayments(f, today);
              return (
                <TR key={f.id} className={f.active ? undefined : "text-muted"}>
                  <TD>
                    <ToggleForm action={toggleFixedActiveAction} hidden={{ id: f.id }} checked={f.active} label={`${f.name} 활성`} />
                  </TD>
                  <TD className="font-medium">
                    {f.name}
                    {f.note ? <span className="block max-w-56 truncate text-xs text-muted">{f.note}</span> : null}
                  </TD>
                  <TD>
                    <Badge>{EXPENSE_CATEGORY_LABELS[f.category]}</Badge>
                  </TD>
                  <TD className="num text-right">
                    <span className="font-semibold">{formatKRW(f.amount)}</span>
                    {f.cycle === "yearly" ? <span className="block text-xs text-muted">월 {formatKRW(monthlyEquivalent(f))}</span> : null}
                  </TD>
                  <TD className="num">{formatBillingDay(f.billingDay, f.cycle, f.billingMonth)}</TD>
                  <TD>
                    {f.paymentMethod ? PAYMENT_METHOD_LABELS[f.paymentMethod] : "—"}
                    {f.institution ? <span className="block text-xs text-muted">{f.institution}</span> : null}
                  </TD>
                  <TD className="num">
                    {f.endDate ? formatDate(f.endDate) : "무기한"}
                    {left !== null ? <span className="block text-xs text-muted">{left}회 남음</span> : null}
                  </TD>
                  <TD className="text-xs text-muted">{EXPENSE_SOURCE_LABELS[f.source]}</TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link href={`/app/fixed/${f.id}`} className={buttonClass("secondary", "sm")} aria-label={`${f.name} 수정`}>
                        수정
                      </Link>
                      <InlineAction
                        action={archiveFixedAction}
                        hidden={{ id: f.id, value: f.archived ? "0" : "1" }}
                        label={f.archived ? "보관 해제" : "보관"}
                        ariaLabel={`${f.name} ${f.archived ? "보관 해제" : "보관"}`}
                      />
                      {f.archived ? (
                        <InlineAction
                          action={deleteFixedAction}
                          hidden={{ id: f.id }}
                          label="삭제"
                          variant="danger"
                          confirmText={`「${f.name}」을(를) 완전히 삭제할까요? 되돌릴 수 없습니다.`}
                          ariaLabel={`${f.name} 삭제`}
                        />
                      ) : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <Card id="add-fixed" className="mt-10 scroll-mt-28">
        <CardHeader>
          <CardTitle>새 고정지출</CardTitle>
          <p className="text-sm text-muted">남은 횟수를 넣으면 종료일이 자동으로 계산됩니다.</p>
        </CardHeader>
        <CardBody>
          <FixedForm action={createFixedAction} item={null} submitLabel="추가" />
        </CardBody>
      </Card>
    </>
  );
}
