import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// 체크박스 기반 스위치: 자바스크립트 없이도 폼 전송이 되고 서버 컴포넌트에서 쓸 수 있다.
export function Switch({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type" | "role"> & { label: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-3 text-sm", className)}>
      <input type="checkbox" role="switch" className="peer sr-only" {...props} />
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border border-line-strong bg-bg-alt transition-colors",
          "peer-checked:border-transparent peer-checked:bg-btn",
          "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]",
          "peer-disabled:opacity-50",
          "after:absolute after:left-0.5 after:top-0.5 after:size-4.5 after:rounded-full after:bg-ink after:transition-transform",
          "peer-checked:after:translate-x-5 peer-checked:after:bg-btn-ink",
        )}
      />
      <span>{label}</span>
    </label>
  );
}
