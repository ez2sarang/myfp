// 법적 고지 화면의 공통 틀 (제목·시행일·본문). 본문은 각 페이지가 섹션으로 채운다.
export function LegalPage({ title, effective, children }: { title: string; effective: string; children: React.ReactNode }) {
  return (
    <article className="wrap max-w-3xl py-14">
      <h1 className="text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">시행일 {effective}</p>
      <p role="note" className="mt-4 rounded-md border border-line bg-bg-alt p-3 text-sm text-muted">
        이 문서는 서비스 운영 방식을 쉽게 설명하기 위한 것이며 법률 자문이 아닙니다.
      </p>
      <div className="mt-8 flex flex-col gap-6 [&_h2]:text-xl [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_ul]:mt-2 [&_ul]:text-muted">{children}</div>
    </article>
  );
}
