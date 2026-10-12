"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 현재 경로와 같으면 aria-current="page" 와 강조 스타일을 붙인다. exact 가 아니면 하위 경로도 활성으로 본다.
export function NavLink({ href, children, exact = false }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-semibold transition-colors",
        active ? "bg-ink text-bg" : "text-muted hover:bg-bg-alt hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
