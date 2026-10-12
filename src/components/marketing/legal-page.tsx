// 법적 고지 화면의 공통 틀 (제목·시행일·본문). 본문은 각 페이지가 섹션으로 채운다.
export function LegalPage({ title, effective, children }: { title: string; effective: string; children: React.ReactNode }) {
  return (
    <article className="wrap max-w-3xl py-14 sm:py-20">
      <p className="eyebrow">정책</p>
      <h1 className="mt-3 text-3xl tracking-[-0.03em] sm:text-[2.6rem]">{title}</h1>
      <p className="num mt-3 text-sm text-muted">시행일 {effective}</p>
      <p role="note" className="mt-6 rounded-lg border border-line bg-surface-2 p-4 text-sm text-muted">
        이 문서는 서비스 운영 방식을 쉽게 설명하기 위한 것이며 법률 자문이 아닙니다.
      </p>
      <div className="mt-10 flex flex-col gap-8 leading-[1.8] [&_h2]:border-t [&_h2]:border-line [&_h2]:pt-8 [&_h2]:text-xl [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li+li]:mt-1.5 [&_p]:text-muted [&_ul]:mt-3 [&_ul]:text-muted [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </div>
    </article>
  );
}
