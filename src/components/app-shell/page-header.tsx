// 화면 제목과 설명, 오른쪽 동작 영역. eyebrow 는 제목 위의 작은 머리말(예: "이번 달 · 2026년 10월").
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-8">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-3xl leading-[1.15] tracking-[-0.035em] sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-prose text-[0.95rem] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
