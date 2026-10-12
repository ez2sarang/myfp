import { cn } from "@/lib/utils";

// myfp 마크: 둥근 사각형 안의 막대 세 개(매달 쌓이는 고정지출). 색은 브랜드 토큰을 따른다.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="myfp" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <rect x="8" y="16" width="4" height="9" rx="1.5" fill="var(--brand-ink)" />
      <rect x="14" y="11" width="4" height="14" rx="1.5" fill="var(--brand-ink)" />
      <rect x="20" y="7" width="4" height="18" rx="1.5" fill="var(--brand-ink)" opacity="0.75" />
    </svg>
  );
}
