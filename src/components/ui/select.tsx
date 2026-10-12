import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// 브라우저 기본 select 를 스타일만 입혀 쓴다 (서버 컴포넌트에서도 동작).
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "min-h-11 rounded-md border border-line-strong bg-surface px-3 text-base text-ink shadow-card transition-colors hover:border-ink/35 focus-visible:border-brand disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
