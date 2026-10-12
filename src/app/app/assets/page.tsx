import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, PiggyBank, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { BalanceForm } from "@/components/balance/balance-form";
import { CompareBarChart } from "@/components/charts/compare-bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { TrendLineChart } from "@/components/charts/trend-line-chart";
import { AssetDetailCard } from "@/components/detail/asset-detail-card";
import { InlineAction } from "@/components/forms/inline-action";
import { Stat } from "@/components/shared/stat";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { createBalanceAction, deleteBalanceAction } from "@/lib/actions/balance";
import { db } from "@/lib/db/pool";
import { listBalances, listSnapshots } from "@/lib/db/queries/balance";
import { assetDonut, assetLiabilityCompare, netWorthTrend } from "@/lib/finance/charts";
import { ASSET_SORTS, assetDetails, listHref, parseListQuery, type AssetSort } from "@/lib/finance/detail-list";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { summarizeBalances } from "@/lib/finance/summary";
import { ASSET_CATEGORIES, LIMITS, balanceCategoryLabel, type BalanceItem } from "@/lib/finance/types";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "자산·부채" };

function BalanceTable({ title, items }: { title: string; items: BalanceItem[] }) {
  const liability = title === "부채";
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <span className="num text-sm text-muted">{items.length}건</span>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">등록한 {title}이 없습니다.</p>
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
                  <TD className="min-w-32 whitespace-normal font-medium">
                    {b.name}
                    {b.note ? <span className="block max-w-40 truncate text-xs text-muted lg:max-w-56">{b.note}</span> : null}
                  </TD>
                  <TD>{balanceCategoryLabel(b.kind, b.category)}</TD>
                  <TD className="num text-right font-semibold">{formatKRW(b.amount)}</TD>
                  <TD className="num">{formatDate(b.asOf)}</TD>
                  {liability ? <TD className="num text-right">{formatKRW(b.monthlyPayment)}</TD> : null}
                  {liability ? (
                    <TD className="num">
                      {b.interestRate === null ? "—" : `${b.interestRate}%`} · {formatDate(b.endDate)}
                    </TD>
                  ) : null}
                  <TD>
                    <div className="flex flex-wrap justify-end gap-2">
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

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireActiveUser("/app/assets");
  const query = parseListQuery<AssetSort>(await searchParams, { sorts: ASSET_SORTS, defaultSort: "amount", categories: ASSET_CATEGORIES });
  const [items, snapshots] = await Promise.all([listBalances(db, viewer.id), listSnapshots(db, viewer.id)]);
  const totals = summarizeBalances(items);
  const trend = netWorthTrend(snapshots);
  const composition = assetDonut(items);
  const details = assetDetails(items, query);
  const filterHrefs = Object.fromEntries(
    composition.items.map((d) => [d.key, listHref("/app/assets", "", { sort: details.query.sort, dir: details.query.dir, cat: d.key }, {}, "#detail-assets")]),
  );
  return (
    <>
      <PageHeader
        eyebrow="잔액 기준"
        title="자산·부채"
        description={`잔액 기준으로 기록합니다. 최대 ${LIMITS.balanceItems}건.`}
        actions={
          <a href="#add-balance" className={buttonClass("primary", "sm", "min-h-11 sm:min-h-9")}>
            새 자산·부채
          </a>
        }
      />
      {items.length === 0 ? (
        <EmptyState className="mb-6" title="아직 등록한 자산·부채가 없습니다" description="예금·투자·대출 잔액을 아래에서 추가하면 순자산과 차트가 계산됩니다." />
      ) : null}
      <section aria-label="자산·부채 요약" className="grid gap-3 sm:grid-cols-3">
        <Stat
          accent
          icon={<Wallet />}
          label="순자산 (자산 − 부채)"
          value={formatKRW(totals.netWorth)}
          tone={totals.netWorth < 0 ? "negative" : "default"}
          className="sm:col-span-1"
        />
        <Stat icon={<PiggyBank />} label="자산 합계" value={formatKRW(totals.assetsTotal)} />
        <Stat icon={<Landmark />} label="부채 잔액 합계" value={formatKRW(totals.liabilitiesTotal)} />
      </section>
      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="shadow-raised lg:min-h-[32rem]">
          <CardHeader>
            <CardTitle>자산 구성</CardTitle>
            <p className="text-sm text-muted">분류를 누르면 오른쪽 목록이 그 분류만 보여 줍니다.</p>
          </CardHeader>
          <CardBody className="pt-6">
            <DonutChart data={composition} centerLabel="자산 합계" emptyText="등록한 자산이 없습니다." filterHrefs={filterHrefs} activeKey={details.query.cat} />
          </CardBody>
        </Card>
        <AssetDetailCard details={details} action="/app/assets#detail-assets" sorts={ASSET_SORTS} fill />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>자산 vs 부채</CardTitle>
          </CardHeader>
          <CardBody>
            <CompareBarChart data={assetLiabilityCompare(totals)} emptyText="등록한 자산·부채가 없습니다." />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>순자산 추이</CardTitle>
            <p className="text-sm text-muted">자산·부채를 추가·수정할 때마다 그 달의 합계가 기록됩니다.</p>
          </CardHeader>
          <CardBody>
            {trend.length >= 2 ? (
              <TrendLineChart points={trend} />
            ) : (
              <p className="py-6 text-center text-sm text-muted">{trend.length === 1 ? "이번 달 기록이 저장됐습니다. 다음 달부터 추이가 표시됩니다." : "자산·부채를 저장하면 이번 달부터 기록이 쌓이고, 다음 달부터 추이가 표시됩니다."}</p>
            )}
          </CardBody>
        </Card>
      </div>
      <section aria-labelledby="balance-lists" className="mt-10 flex flex-col gap-4">
        <h2 id="balance-lists" className="text-xl">
          등록한 항목
        </h2>
        <BalanceTable title="자산" items={items.filter((b) => b.kind === "asset")} />
        <BalanceTable title="부채" items={items.filter((b) => b.kind === "liability")} />
      </section>
      <Card id="add-balance" className="mt-10 scroll-mt-28">
        <CardHeader>
          <CardTitle>새 자산·부채</CardTitle>
          <p className="text-sm text-muted">잔액과 기준일을 넣으면 순자산과 이번 달 기록이 바로 갱신됩니다.</p>
        </CardHeader>
        <CardBody>
          <BalanceForm action={createBalanceAction} item={null} submitLabel="추가" />
        </CardBody>
      </Card>
    </>
  );
}
