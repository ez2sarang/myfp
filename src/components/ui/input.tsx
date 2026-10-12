import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink",
        "placeholder:text-muted disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
