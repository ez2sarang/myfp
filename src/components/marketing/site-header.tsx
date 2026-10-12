import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { buttonClass } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="wrap flex h-[var(--header-h)] items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold" aria-label={`${SITE_NAME} 홈`}>
          <BrandMark className="size-7" />
          <span className="text-lg tracking-tight">{SITE_NAME}</span>
        </Link>
        <nav aria-label="소개 메뉴" className="ml-auto hidden items-center gap-5 text-sm font-medium text-muted sm:flex">
          <a href="#features" className="hover:text-ink">
            기능
          </a>
          <a href="#how" className="hover:text-ink">
            사용 방법
          </a>
          <a href="#security" className="hover:text-ink">
            보안
          </a>
        </nav>
        <Link href="/login" className={buttonClass("primary", "sm", "ml-auto sm:ml-0")}>
          로그인
        </Link>
      </div>
    </header>
  );
}
