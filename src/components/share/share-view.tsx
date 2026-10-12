import Link from "next/link";
import { Eye } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { CompareBarChart } from "@/components/charts/compare-bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { AssetDetailCard } from "@/components/detail/asset-detail-card";
import { FixedDetailCard } from "@/components/detail/fixed-detail-card";
import { listHref } from "@/lib/finance/detail-list";
import { Stat } from "@/components/shared/stat";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { SITE_NAME } from "@/lib/site";
import type { ShareView } from "@/lib/share/view";

const HIDDEN = "비공개";

// 섹션 제목 + 오른쪽으로 이어지는 얇은 선
function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 id={id} className="text-xl">
        {children}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}
const money = (value: number | null | undefined): string => (value === null || value === undefined ? HIDDEN : formatKRW(value));

// 공유 보기 화면. 입력은 서버에서 가림을 적용한 ShareView 뿐이다(숨긴 값은 애초에 없다).
export function ShareViewScreen({ view, basePath, pendingViewer = false }: { view: ShareView; basePath: string; pendingViewer?: boolean }) {
  const hideAmounts = view.masks.amounts;
  // 두 세부 목록의 상태를 서로 보존한다 (고정지출: sort·dir·cat, 자산: asort·adir·acat).
  const fq = view.summary?.details.query;
  const aq = view.balances?.details.query;
  const fixedKeep: Record<string, string> = fq ? { sort: fq.sort, dir: fq.dir, ...(fq.cat ? { cat: fq.cat } : {}) } : {};
  const assetKeep: Record<string, string> = aq ? { asort: aq.sort, adir: aq.dir, ...(aq.cat ? { acat: aq.cat } : {}) } : {};
  return (
    <div className="min-h-dvh">
      <div role="note" className="bg-band text-band-ink">
        <div className="wrap flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-band-ink/10 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-band-ink/20">
            <Eye aria-hidden="true" className="size-3.5" />
            읽기 전용
          </span>
          <span className="num text-band-muted">
            생성 {formatDate(view.createdOn)} · {view.expiresOn ? `만료 ${formatDate(view.expiresOn)}` : "만료 없음"}
          </span>
          <span className="text-band-muted">이 링크는 {SITE_NAME} 에 가입한 사람만 열 수 있는 공유 보기입니다.</span>
        </div>
      </div>
      <header className="border-b border-line bg-surface">
        <div className="wrap flex h-[var(--header-h)] items-center gap-2.5">
          <BrandMark className="size-7" />
          <span className="text-[1.05rem] font-bold tracking-tight">{SITE_NAME}</span>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-line-strong" />
          <span className="text-sm text-muted">공유된 재무 요약</span>
        </div>
      </header>
      <main id="main" className="wrap flex flex-col gap-10 py-8 pb-20 sm:py-10">
        {pendingViewer || hideAmounts ? (
          <div className="-mb-4 flex flex-col gap-3">
            {pendingViewer ? (
              <p role="note" className="rounded-lg border border-line bg-info-bg px-4 py-3 text-sm text-info-ink">
                지금 계정이 가입 대기 상태라 내 공간(고정지출·자산 관리)은 아직 사용할 수 없고 공유 보기만 열 수 있습니다.
              </p>
            ) : null}
            {hideAmounts ? (
              <p className="rounded-lg border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm text-muted">
                공유한 사람이 금액을 숨겼습니다. 금액·합계·비중과 차트 없이 항목 정보만 보입니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {view.summary ? (
          <section aria-labelledby="share-summary" className="flex flex-col gap-4">
            <SectionTitle id="share-summary">요약</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat accent label="월 고정지출" value={money(view.summary.monthlyTotal)} hint={`활성 ${view.summary.activeCount}건`} />
              <Stat label="이번 달 남은 납부액" value={money(view.summary.remainingThisMonth)} hint={`이달 말까지 ${view.summary.remainingThisMonthCount}건`} />
              <Stat label="다음 30일 납부" value={`${view.summary.upcoming.length}건`} />
            </div>
            {view.summary.charts ? (
              <>
                <div className="grid items-stretch gap-4 lg:grid-cols-2">
                  <Card className="shadow-raised lg:min-h-[36rem]">
                    <CardHeader>
                      <CardTitle>분류별 월 고정지출</CardTitle>
                    </CardHeader>
                    <CardBody className="pt-6">
                      <DonutChart
                        data={view.summary.charts.categories}
                        centerLabel="월 합계"
                        emptyText="활성 고정지출이 없습니다."
                        activeKey={view.summary.details.query.cat}
                        filterHrefs={Object.fromEntries(
                          view.summary.charts.categories.items.map((d) => [
                            d.key,
                            listHref(basePath, "", { sort: view.summary!.details.query.sort, dir: view.summary!.details.query.dir, cat: d.key }, assetKeep, "#detail-list"),
                          ]),
                        )}
                      />
                    </CardBody>
                  </Card>
                  <FixedDetailCard details={view.summary.details} action={`${basePath}#detail-list`} sorts={view.summary.sorts} keep={assetKeep} fill />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>향후 12개월 예상 지출</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <StackedBarChart data={view.summary.charts.projection} title="향후 12개월 월별 예상 지출" emptyText="예상 지출이 없습니다." />
                  </CardBody>
                </Card>
              </>
            ) : (
              // 금액을 숨긴 링크: 차트·비중 없이 금액 아닌 세부 목록만
              <FixedDetailCard details={view.summary.details} action={`${basePath}#detail-list`} sorts={view.summary.sorts} keep={assetKeep} />
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>분류별</CardTitle>
                </CardHeader>
                <CardBody>
                  <ul className="-my-1 flex flex-col divide-y divide-line text-sm">
                    {view.summary.byCategory.map((c) => (
                      <li key={c.label} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="font-medium">
                          {c.label} <span className="num font-normal text-muted">({c.count}건)</span>
                        </span>
                        <span className="num shrink-0 text-right font-semibold tracking-[-0.01em]">{money(c.monthly)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>다음 30일 일정</CardTitle>
                </CardHeader>
                <CardBody>
                  {view.summary.upcoming.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted">예정된 납부가 없습니다.</p>
                  ) : (
                    <ul className="-my-1 flex flex-col divide-y divide-line text-sm">
                      {view.summary.upcoming.map((u, i) => (
                        <li key={`${u.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="num w-[5.5rem] shrink-0 text-xs text-muted">{formatDate(u.date)}</span>
                            <span className="font-medium">{u.name}</span>
                          </span>
                          <span className="num shrink-0 text-right font-semibold tracking-[-0.01em]">{money(u.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>
          </section>
        ) : null}

        {view.fixed ? (
          <section aria-labelledby="share-fixed" className="flex flex-col gap-3">
            <SectionTitle id="share-fixed">고정지출</SectionTitle>
            {view.fixed.length === 0 ? (
              <EmptyState title="공유된 고정지출이 없습니다" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>이름</TH>
                    <TH>분류</TH>
                    <TH>납부일</TH>
                    <TH className="text-right">금액</TH>
                    <TH>종료일</TH>
                    <TH>결제수단</TH>
                    {view.masks.details ? null : <TH>기관·메모</TH>}
                  </TR>
                </THead>
                <TBody>
                  {view.fixed.map((f, i) => (
                    <TR key={`${f.name}-${i}`}>
                      <TD className="font-medium">{f.name}</TD>
                      <TD>{f.category}</TD>
                      <TD>{f.schedule}</TD>
                      <TD className="num text-right font-semibold">{money(f.amount)}</TD>
                      <TD className="num">{formatDate(f.endDate)}</TD>
                      <TD>{f.paymentMethod ?? "—"}</TD>
                      {view.masks.details ? null : <TD className="whitespace-normal">{[f.institution, f.note].filter(Boolean).join(" · ") || "—"}</TD>}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </section>
        ) : null}

        {view.balances ? (
          <section aria-labelledby="share-balances" className="flex flex-col gap-3">
            <SectionTitle id="share-balances">자산·부채</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat accent label="자산 합계" value={money(view.balances.assetsTotal)} />
              <Stat label="부채 합계" value={money(view.balances.liabilitiesTotal)} />
              <Stat label="순자산" value={money(view.balances.netWorth)} />
            </div>
            {view.balances.charts ? (
              <>
                <div className="grid items-stretch gap-4 lg:grid-cols-2">
                  <Card className="shadow-raised lg:min-h-[32rem]">
                    <CardHeader>
                      <CardTitle>자산 구성</CardTitle>
                    </CardHeader>
                    <CardBody className="pt-6">
                      <DonutChart
                        data={view.balances.charts.composition}
                        centerLabel="자산 합계"
                        emptyText="자산 항목이 없습니다."
                        activeKey={view.balances.details.query.cat}
                        filterHrefs={Object.fromEntries(
                          view.balances.charts.composition.items.map((d) => [
                            d.key,
                            listHref(basePath, "a", { sort: view.balances!.details.query.sort, dir: view.balances!.details.query.dir, cat: d.key }, fixedKeep, "#adetail-assets"),
                          ]),
                        )}
                      />
                    </CardBody>
                  </Card>
                  <AssetDetailCard details={view.balances.details} action={`${basePath}#adetail-assets`} prefix="a" sorts={view.balances.sorts} keep={fixedKeep} fill />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>자산 vs 부채</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <CompareBarChart data={view.balances.charts.compare} emptyText="자산·부채 항목이 없습니다." />
                  </CardBody>
                </Card>
              </>
            ) : (
              <AssetDetailCard details={view.balances.details} action={`${basePath}#adetail-assets`} prefix="a" sorts={view.balances.sorts} keep={fixedKeep} />
            )}
            {[
              { title: "자산", rows: view.balances.assets },
              { title: "부채", rows: view.balances.liabilities },
            ].map((group) => (
              <Card key={group.title}>
                <CardHeader>
                  <CardTitle>{group.title}</CardTitle>
                </CardHeader>
                <CardBody>
                  {group.rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted">항목이 없습니다.</p>
                  ) : (
                    <ul className="-my-1 flex flex-col divide-y divide-line text-sm">
                      {group.rows.map((b, i) => (
                        <li key={`${b.name}-${i}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                          <span>
                            <span className="font-medium">{b.name}</span> <span className="text-muted">({b.category})</span>
                            {b.endDate ? <span className="text-muted"> · 종료 {formatDate(b.endDate)}</span> : null}
                            {b.note ? <span className="text-muted"> · {b.note}</span> : null}
                          </span>
                          <span className="num shrink-0 text-right font-semibold tracking-[-0.01em]">{money(b.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ))}
          </section>
        ) : null}

        <p className="border-t border-line pt-6 text-sm text-muted">
          나도 고정지출을 정리해 보고 싶다면{" "}
          <Link href="/" className="font-semibold text-brand underline underline-offset-4">
            {SITE_NAME} 알아보기
          </Link>
        </p>
      </main>
    </div>
  );
}
