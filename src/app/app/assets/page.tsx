import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { BalanceForm } from "@/components/balance/balance-form";
import { InlineAction } from "@/components/forms/inline-action";
import { Stat } from "@/components/shared/stat";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { createBalanceAction, deleteBalanceAction } from "@/lib/actions/balance";
import { db } from "@/lib/db/pool";
import { listBalances } from "@/lib/db/queries/balance";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { summarizeBalances } from "@/lib/finance/summary";
import { LIMITS, balanceCategoryLabel, type BalanceItem } from "@/lib/finance/types";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "자산·부채" };

function BalanceTable({ title, items }: { title: string; items: BalanceItem[] }) {
  const liability = title === "부채";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <p className="text-sm text-muted">등록한 {title}이 없습니다.</p>
        ) : (
          <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": `${title} 목록` }}>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>분류</TH>
                <TH className="text-right">{liability ? "잔액" : "금액"}</TH>
                <TH>기준일</TH>
                {liability ? <TH className="text-right">월 상환</TH> : null}
                {liability ? <TH>금리·종료일</TH> : null}
                <TH>
                  <span className="sr-only">동작</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {items.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">
                    {b.name}
                    {b.note ? <span className="block max-w-56 truncate text-xs text-muted">{b.note}</span> : null}
                  </TD>
                  <TD>{balanceCategoryLabel(b.kind, b.category)}</TD>
                  <TD className="text-right font-semibold">{formatKRW(b.amount)}</TD>
                  <TD>{formatDate(b.asOf)}</TD>
                  {liability ? <TD className="text-right">{formatKRW(b.monthlyPayment)}</TD> : null}
                  {liability ? (
                    <TD>
                      {b.interestRate === null ? "—" : `${b.interestRate}%`} · {formatDate(b.endDate)}
                    </TD>
                  ) : null}
                  <TD>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/app/assets/${b.id}`} className={buttonClass("secondary", "sm")} aria-label={`${b.name} 수정`}>
                        수정
                      </Link>
                      <InlineAction
                        action={deleteBalanceAction}
                        hidden={{ id: b.id }}
                        label="삭제"
                        variant="danger"
                        confirmText={`「${b.name}」을(를) 삭제할까요?`}
                        ariaLabel={`${b.name} 삭제`}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

export default async function AssetsPage() {
  const viewer = await requireActiveUser("/app/assets");
  const items = await listBalances(db, viewer.id);
  const totals = summarizeBalances(items);
  return (
    <>
      <PageHeader title="자산·부채" description={`잔액 기준으로 기록합니다. 최대 ${LIMITS.balanceItems}건.`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="자산 합계" value={formatKRW(totals.assetsTotal)} />
        <Stat label="부채 합계" value={formatKRW(totals.liabilitiesTotal)} />
        <Stat label="순자산" value={formatKRW(totals.netWorth)} tone={totals.netWorth < 0 ? "negative" : "default"} />
      </div>
      {items.length === 0 ? <EmptyState className="mb-6" title="아직 등록한 자산·부채가 없습니다" description="예금·투자·대출 잔액을 추가하면 순자산이 계산됩니다." /> : null}
      <div className="grid gap-4">
        <BalanceTable title="자산" items={items.filter((b) => b.kind === "asset")} />
        <BalanceTable title="부채" items={items.filter((b) => b.kind === "liability")} />
      </div>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>새 자산·부채</CardTitle>
        </CardHeader>
        <CardBody>
          <BalanceForm action={createBalanceAction} item={null} submitLabel="추가" />
        </CardBody>
      </Card>
    </>
  );
}
