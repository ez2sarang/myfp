import Link from "next/link";
import { signOutAction } from "@/components/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";
import { NavLink } from "./nav-link";

export const APP_NAV = [
  { href: "/app", label: "대시보드", exact: true },
  { href: "/app/fixed", label: "고정지출" },
  { href: "/app/assets", label: "자산·부채" },
  { href: "/app/share", label: "공유 링크" },
  { href: "/app/settings", label: "설정" },
] as const;

// 로그인 이후 화면의 틀: 상단 바(로고·메뉴·로그아웃). 메뉴는 좁은 화면에서 가로로 스크롤된다.
// 보여 주는 것만 다룬다 — 접근 제어는 각 페이지·액션의 requireActiveUser/requireAdmin 이 한다.
export function AppShell({
  children,
  showNav,
  isAdmin,
  displayName,
}: {
  children: React.ReactNode;
  showNav: boolean;
  isAdmin: boolean;
  displayName: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="wrap flex h-[var(--header-h)] items-center gap-4">
          <Link href="/app" className="flex items-center gap-2 font-bold" aria-label={`${SITE_NAME} 대시보드`}>
            <BrandMark className="size-7" />
            <span className="text-lg tracking-tight">{SITE_NAME}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-muted sm:inline">{displayName}</span>
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" size="sm">
                로그아웃
              </Button>
            </form>
          </div>
        </div>
        {showNav ? (
          <nav aria-label="주 메뉴" className="wrap flex gap-1 overflow-x-auto pb-2">
            {APP_NAV.map((item) => (
              <NavLink key={item.href} href={item.href} exact={"exact" in item ? item.exact : false}>
                {item.label}
              </NavLink>
            ))}
            {isAdmin ? <NavLink href="/admin/users">사용자 관리</NavLink> : null}
          </nav>
        ) : null}
      </header>
      <main id="main" className="wrap flex-1 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
