import { cn } from "@/lib/utils";

// 요약 숫자 카드 하나 (이름, 값, 보조 설명). icon 은 장식, accent 는 첫 카드 등 강조용 윗선.
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  accent = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative";
  icon?: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-line bg-surface p-4 shadow-card sm:p-5",
        className,
      )}
    >
      {accent ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-brand" /> : null}
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted">
        <span className="truncate">{label}</span>
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
              accent ? "bg-brand-soft text-brand" : "bg-bg-alt text-muted",
            )}
          >
            {icon}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "num text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-[1.9rem]",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs leading-relaxed text-muted">{hint}</span> : null}
    </div>
  );
}
