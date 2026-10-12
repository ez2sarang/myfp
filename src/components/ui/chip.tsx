import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function chipClass(selected: boolean | undefined, className?: string): string {
  return cn(
    "inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors",
    selected
      ? "border-transparent bg-btn text-btn-ink"
      : "border-line-strong bg-surface text-ink hover:bg-bg-alt",
    className,
  );
}

// 필터·태그용 알약 모양 토글. 이벤트 처리가 필요하면 부모에서 use client 컴포넌트로 감싼다.
export function Chip({
  selected,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { selected?: boolean }) {
  return <button type={type} aria-pressed={selected} className={chipClass(selected, className)} {...props} />;
}

// 주소(쿼리스트링)로 상태를 표현하는 필터용.
export function ChipLink({
  selected,
  className,
  ...props
}: ComponentProps<typeof Link> & { selected?: boolean }) {
  return <Link aria-current={selected ? "true" : undefined} className={chipClass(selected, className)} {...props} />;
}
