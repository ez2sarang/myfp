"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const VARIANTS = {
  // 데스크톱 상단 탭: 활성은 글자 진하게 + 아래 코발트 밑줄
  tab: {
    base: "relative inline-flex h-full shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
    on: "text-ink after:bg-brand",
    off: "text-muted after:bg-transparent hover:text-ink hover:after:bg-line-strong",
  },
  // 모바일 하단 탭 막대: 아이콘 + 작은 이름, 활성은 아이콘 뒤 옅은 코발트 알약
  bottom: {
    base: "group flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium leading-tight transition-colors",
    on: "text-brand",
    off: "text-muted hover:text-ink",
  },
  // 모바일 상단 바의 작은 보조 링크 (관리자 메뉴 등)
  compact: {
    base: "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
    on: "bg-brand-soft text-brand",
    off: "text-muted hover:bg-bg-alt hover:text-ink",
  },
} as const;

// 현재 경로와 같으면 aria-current="page" 와 강조 스타일을 붙인다. exact 가 아니면 하위 경로도 활성으로 본다.
export function NavLink({
  href,
  children,
  exact = false,
  variant = "tab",
  icon,
  className,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  variant?: keyof typeof VARIANTS;
  /** 장식용 아이콘 (서버에서 그린 요소를 넘긴다) */
  icon?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const v = VARIANTS[variant];
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(v.base, active ? v.on : v.off, className)}>
      {icon ? (
        variant === "bottom" ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex h-7 w-12 items-center justify-center rounded-full transition-colors [&_svg]:size-[1.2rem]",
              active ? "bg-brand-soft" : "group-hover:bg-bg-alt",
            )}
          >
            {icon}
          </span>
        ) : (
          <span aria-hidden="true" className="flex [&_svg]:size-4">
            {icon}
          </span>
        )
      ) : null}
      <span className={variant === "bottom" ? "max-w-full truncate" : undefined}>{children}</span>
    </Link>
  );
}
