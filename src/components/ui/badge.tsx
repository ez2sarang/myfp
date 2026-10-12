import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "positive" | "negative" | "info" | "warn";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-bg-alt text-muted",
  brand: "bg-brand-soft text-brand",
  positive: "bg-positive-bg text-positive",
  negative: "bg-negative-bg text-negative",
  info: "bg-info-bg text-info-ink",
  warn: "bg-warn-bg text-warn-ink",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold leading-5",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
