import Link from "next/link";
import { Eye } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { CompareBarChart } from "@/components/charts/compare-bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { AssetDetailCard } from "@/components/detail/asset-detail-card";
import { ListControls } from "@/components/detail/list-controls";
import { Badge } from "@/components/ui/badge";
import { SORT_LABELS, listHref } from "@/lib/finance/detail-list";
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
          <span className="text-band-muted">기간 {view.period.label}</span>
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
            <SectionTitle id="share-summary">요약 · {view.period.label}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                accent
                label={view.period.months.length > 1 ? "기간 지출 합계" : "이 달 지출 합계"}
                value={money(view.summary.total)}
                hint={`고정 ${money(view.summary.fixedTotal)} · 예정·일회성 ${money(view.summary.plannedTotal)}`}
              />
              {view.summary.current ? (
                <Stat
                  label="이번 달 남은 납부액"
                  value={money(view.summary.current.remainingTotal)}
                  hint={`남은 ${view.summary.current.remainingCount}건 · 납부 완료 ${view.summary.current.paidCount}건`}
                />
              ) : (
                <Stat label="기간" value={view.period.months.length > 1 ? `${view.period.months.length}개월` : "한 달"} hint={view.period.label} />
              )}
              <Stat label="항목 수" value={`${view.summary.count}건`} hint="건너뛴 지출 제외" />
            </div>
            {view.summary.charts ? (
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                <Card className="shadow-raised lg:min-h-[36rem]">
                  <CardHeader>
                    <CardTitle>분류별 지출 ({view.period.label})</CardTitle>
                  </CardHeader>
                  <CardBody className="pt-6">
                    <DonutChart
                      data={view.summary.charts.categories}
                      centerLabel="기간 합계"
                      emptyText="이 기간에 낼 지출이 없습니다."
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
                <ShareOccurrenceCard view={view} basePath={basePath} keep={assetKeep} fill />
              </div>
            ) : (
              // 금액을 숨긴 링크: 차트·비중 없이 금액 아닌 세부 목록만
              <ShareOccurrenceCard view={view} basePath={basePath} keep={assetKeep} />
            )}
            {view.summary.charts?.months ? (
              <Card>
                <CardHeader>
                  <CardTitle>월별 지출</CardTitle>
                </CardHeader>
                <CardBody>
                  <StackedBarChart data={view.summary.charts.months} title="기간 월별 지출" emptyText="이 기간에 낼 지출이 없습니다." />
                </CardBody>
              </Card>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              {view.summary.months.length > 1 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>달별 합계</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "달별 합계" }}>
                      <THead>
                        <TR>
                          <TH>달</TH>
                          <TH className="text-right">건수</TH>
                          <TH className="text-right">고정</TH>
                          <TH className="text-right">예정·일회성</TH>
                          <TH className="text-right">합계</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {view.summary.months.map((m) => (
                          <TR key={m.month}>
                            <TD>{m.label}</TD>
                            <TD className="num text-right">{m.count}</TD>
                            <TD className="num text-right">{money(m.fixed)}</TD>
                            <TD className="num text-right">{money(m.planned)}</TD>
                            <TD className="num text-right font-semibold">{money(m.total)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </CardBody>
                </Card>
              ) : null}
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
                        <span className="num shrink-0 text-right font-semibold tracking-[-0.01em]">{money(c.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </div>
          </section>
        ) : null}

        {view.fixed ? (
          <section aria-labelledby="share-fixed" className="flex flex-col gap-3">
            <SectionTitle id="share-fixed">고정지출</SectionTitle>
            <p className="-mt-1 text-sm text-muted">현재 정의 기준: 공유 기간({view.period.label}) 안에 납부가 있는 항목만 고르며, 금액·종료일 등은 지금의 값입니다.</p>
            {view.fixed.length === 0 ? (
              <EmptyState title="공유된 고정지출이 없습니다" />
            ) : (
              <Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "공유된 고정지출 목록" }}>
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
                      <TD className="min-w-32 whitespace-normal font-medium">{f.name}</TD>
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
            <p className="-mt-1 text-sm text-muted">자산·부채는 기간과 상관없이 열람 시점의 현재 값입니다.</p>
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

const STATE_LABEL = { paid: "납부 완료", due: "남음", planned: "예정", skipped: "건너뜀" } as const;

// 기간 안 발생의 세부 목록 (정렬·분류 필터는 GET 쿼리, 기간이 두 달 이상이면 달 열을 함께 보여 준다)
function ShareOccurrenceCard({ view, basePath, keep, fill = false }: { view: ShareView; basePath: string; keep: Record<string, string>; fill?: boolean }) {
  const s = view.summary;
  if (!s) return null;
  const d = s.details;
  const multi = view.period.months.length > 1;
  const selected = d.categories.find((c) => c.key === d.query.cat)?.label ?? "전체";
  return (
    <Card id="detail-list" className={fill ? "flex scroll-mt-28 flex-col lg:h-0 lg:min-h-full" : "flex scroll-mt-28 flex-col"}>
      <CardHeader className="flex-row items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>세부 항목</CardTitle>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{selected}</span> · <span className="num">{d.count}건</span>
          </p>
        </div>
        {d.total !== null ? (
          <p className="flex shrink-0 flex-col items-end text-right">
            <span className="text-xs text-muted">합계(건너뜀 제외)</span>
            <span className="num text-xl font-semibold tracking-[-0.02em]">{formatKRW(d.total)}</span>
          </p>
        ) : null}
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-1">
        <ListControls
          action={`${basePath}#detail-list`}
          sorts={s.sorts.map((k) => ({ key: k, label: SORT_LABELS[k] }))}
          query={d.query}
          categories={d.categories}
          keep={keep}
          label="세부 항목"
        />
        {d.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">보여 줄 항목이 없습니다.</p>
        ) : (
          <ol tabIndex={0} aria-label="세부 항목 목록" className="-mx-2 flex max-h-[420px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto overscroll-contain px-2 text-sm lg:max-h-none">
            {d.rows.map((r, i) => (
              <li key={`${r.month}-${r.name}-${i}`} className="flex items-start gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={r.state === "skipped" ? "font-semibold text-muted line-through" : "font-semibold text-ink"}>{r.name}</span>
                    {r.kind === "planned" ? <Badge tone="brand">{r.installment ? `예정 ${r.installment}` : "예정·일회성"}</Badge> : null}
                    <Badge>{r.category}</Badge>
                    <Badge tone={r.state === "paid" ? "positive" : r.state === "due" ? "warn" : r.state === "planned" ? "info" : "neutral"}>{STATE_LABEL[r.state]}</Badge>
                  </span>
                  <span className="num text-xs text-muted">
                    {multi ? `${r.month.replace("-", ".")} · ` : ""}
                    {r.date ? formatDate(r.date) : "납부일 미정"}
                  </span>
                </div>
                {r.amount !== null ? <span className="num shrink-0 pt-0.5 text-right text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{formatKRW(r.amount)}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
