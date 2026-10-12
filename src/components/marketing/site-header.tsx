import Link from "next/link";
import { Menu } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { buttonClass } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";
import { NAV, SIGNED_IN } from "./content";
import { SessionLink } from "./session-link";

// 소개 페이지 머리: 넓은 화면은 가운데 메뉴, 좁은 화면은 <details> 로 여닫는 메뉴(자바스크립트 없이 동작).
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="wrap flex h-[var(--header-h)] items-center gap-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold" aria-label={`${SITE_NAME} 홈`}>
          <BrandMark className="size-7" />
          <span className="text-lg tracking-tight">{SITE_NAME}</span>
        </Link>
        <nav aria-label="소개 메뉴" className="ml-6 hidden items-center gap-1 text-sm font-medium text-muted md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={`/${item.href}`} className="rounded-md px-3 py-2 transition-colors hover:bg-bg-alt hover:text-ink">
              {item.label}
            </a>
          ))}
          <Link href="/guide" className="rounded-md px-3 py-2 transition-colors hover:bg-bg-alt hover:text-ink">
            가이드
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SessionLink signedOutHref="/login" signedOutLabel="로그인" hideWhenSignedIn className={buttonClass("ghost", "sm", "hidden sm:inline-flex")} />
          <SessionLink
            signedOutHref="/login"
            signedOutLabel="시작하기"
            signedInHref={SIGNED_IN.href}
            signedInLabel={SIGNED_IN.nav}
            className={buttonClass("primary", "sm", "min-w-[5.5rem]")}
          />
          <details className="relative md:hidden">
            <summary
              aria-label="메뉴 열기"
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-md border border-line bg-surface [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </summary>
            <nav
              aria-label="소개 메뉴 (모바일)"
              className="absolute right-0 top-[calc(100%+8px)] flex w-56 flex-col rounded-lg border border-line bg-surface p-1.5 text-sm font-medium shadow-raised"
            >
              {NAV.map((item) => (
                <a key={item.href} href={`/${item.href}`} className="flex min-h-11 items-center rounded-md px-3 hover:bg-bg-alt">
                  {item.label}
                </a>
              ))}
              <Link href="/guide" className="flex min-h-11 items-center rounded-md px-3 hover:bg-bg-alt">
                가이드
              </Link>
              <SessionLink
                signedOutHref="/login"
                signedOutLabel="로그인"
                signedInHref={SIGNED_IN.href}
                signedInLabel={SIGNED_IN.nav}
                className="flex min-h-11 items-center rounded-md px-3 hover:bg-bg-alt sm:hidden"
              />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
