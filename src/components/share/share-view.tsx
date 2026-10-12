import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Stat } from "@/components/shared/stat";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, formatKRW } from "@/lib/finance/format";
import { SITE_NAME } from "@/lib/site";
import type { ShareView } from "@/lib/share/view";

const HIDDEN = "비공개";
const money = (value: number | null | undefined): string => (value === null || value === undefined ? HIDDEN : formatKRW(value));

// 공유 보기 화면. 입력은 서버에서 가림을 적용한 ShareView 뿐이다(숨긴 값은 애초에 없다).
export function ShareViewScreen({ view }: { view: ShareView }) {
  const hideAmounts = view.masks.amounts;
  return (
    <div className="min-h-dvh">
      <div role="note" className="bg-band text-band-ink">
        <div className="wrap flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
          <span className="font-semibold">읽기 전용</span>
          <span className="text-band-muted">
            생성 {formatDate(view.createdOn)} · {view.expiresOn ? `만료 ${formatDate(view.expiresOn)}` : "만료 없음"}
          </span>
          <span className="text-band-muted">이 링크는 {SITE_NAME} 로 만든 공유 보기입니다.</span>
        </div>
      </div>
      <header className="wrap flex items-center gap-2 py-5">
        <BrandMark className="size-7" />
        <span className="text-lg font-bold">{SITE_NAME}</span>
        <span className="ml-2 text-sm text-muted">공유된 재무 요약</span>
      </header>
      <main id="main" className="wrap flex flex-col gap-6 pb-16">
        {hideAmounts ? <p className="text-sm text-muted">공유한 사람이 금액을 숨겼습니다.</p> : null}

        {view.summary ? (
          <section aria-labelledby="share-summary" className="flex flex-col gap-4">
            <h2 id="share-summary" className="text-xl">
              요약
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="월 고정지출" value={money(view.summary.monthlyTotal)} hint={`활성 ${view.summary.activeCount}건`} />
              <Stat label="연 환산" value={money(view.summary.annualTotal)} />
              <Stat label="다음 30일 납부" value={`${view.summary.upcoming.length}건`} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>분류별</CardTitle>
                </CardHeader>
                <CardBody>
                  <ul className="flex flex-col gap-2 text-sm">
                    {view.summary.byCategory.map((c) => (
                      <li key={c.label} className="flex justify-between gap-2">
                        <span>
                          {c.label} <span className="text-muted">({c.count}건)</span>
                        </span>
                        <span className="num font-semibold">{money(c.monthly)}</span>
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
                    <p className="text-sm text-muted">예정된 납부가 없습니다.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 text-sm">
                      {view.summary.upcoming.map((u, i) => (
                        <li key={`${u.date}-${i}`} className="flex justify-between gap-2">
                          <span>
                            <span className="num text-muted">{formatDate(u.date)}</span> {u.name}
                          </span>
                          <span className="num font-semibold">{money(u.amount)}</span>
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
            <h2 id="share-fixed" className="text-xl">
              고정지출
            </h2>
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
                      <TD className="text-right">{money(f.amount)}</TD>
                      <TD>{formatDate(f.endDate)}</TD>
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
            <h2 id="share-balances" className="text-xl">
              자산·부채
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="자산 합계" value={money(view.balances.assetsTotal)} />
              <Stat label="부채 합계" value={money(view.balances.liabilitiesTotal)} />
              <Stat label="순자산" value={money(view.balances.netWorth)} />
            </div>
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
                    <p className="text-sm text-muted">항목이 없습니다.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 text-sm">
                      {group.rows.map((b, i) => (
                        <li key={`${b.name}-${i}`} className="flex flex-wrap justify-between gap-2">
                          <span>
                            {b.name} <span className="text-muted">({b.category})</span>
                            {b.endDate ? <span className="text-muted"> · 종료 {formatDate(b.endDate)}</span> : null}
                            {b.note ? <span className="text-muted"> · {b.note}</span> : null}
                          </span>
                          <span className="num font-semibold">{money(b.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ))}
          </section>
        ) : null}

        <p className="text-sm text-muted">
          나도 고정지출을 정리해 보고 싶다면{" "}
          <Link href="/" className="font-semibold text-brand underline underline-offset-4">
            {SITE_NAME} 알아보기
          </Link>
        </p>
      </main>
    </div>
  );
}
