import { cn } from "@/lib/utils";

// 요약 숫자 카드 하나 (이름, 값, 보조 설명).
export function Stat({ label, value, hint, tone = "default", className }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 sm:p-5", className)}>
      <span className="text-sm font-medium text-muted">{label}</span>
      <span
        className={cn(
          "num text-2xl font-bold tracking-tight sm:text-3xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
