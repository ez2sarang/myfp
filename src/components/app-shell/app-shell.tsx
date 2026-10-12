import Link from "next/link";
import { CalendarClock, LayoutDashboard, Link2, LogOut, Settings, ShieldCheck, Users, Wallet } from "lucide-react";
import { signOutAction } from "@/components/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";
import { NavLink } from "./nav-link";

export const APP_NAV = [
  { href: "/app", label: "대시보드", exact: true },
  { href: "/app/fixed", label: "고정지출" },
  { href: "/app/assets", label: "자산·부채" },
  { href: "/app/household", label: "함께 보기" },
  { href: "/app/share", label: "공유 링크" },
  { href: "/app/settings", label: "설정" },
] as const;

// 메뉴 아이콘 (장식). APP_NAV 의 href 를 키로 쓴다.
const NAV_ICONS: Record<(typeof APP_NAV)[number]["href"], React.ReactNode> = {
  "/app": <LayoutDashboard strokeWidth={1.9} />,
  "/app/fixed": <CalendarClock strokeWidth={1.9} />,
  "/app/assets": <Wallet strokeWidth={1.9} />,
  "/app/household": <Users strokeWidth={1.9} />,
  "/app/share": <Link2 strokeWidth={1.9} />,
  "/app/settings": <Settings strokeWidth={1.9} />,
};

// 로그인 이후 화면의 틀.
//  - 넓은 화면: 상단 바(로고·이름·로그아웃) + 그 아래 탭 줄(활성은 코발트 밑줄).
//  - 좁은 화면(sm 미만): 탭 줄을 숨기고 화면 아래에 고정 탭 막대(아이콘 + 이름, 44px 이상)를 둔다. 관리자 메뉴는 상단 바의 작은 링크.
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
  const initial = displayName.trim().charAt(0).toUpperCase();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md backdrop-saturate-150">
        <div className="wrap flex h-[var(--header-h)] items-center gap-3">
          <Link href="/app" className="flex min-h-11 items-center gap-2.5 rounded-md font-bold" aria-label={`${SITE_NAME} 대시보드`}>
            <BrandMark className="size-7" />
            <span className="text-[1.05rem] tracking-tight">{SITE_NAME}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            {showNav && isAdmin ? (
              <NavLink href="/admin/users" variant="compact" icon={<ShieldCheck />} className="sm:hidden">
                사용자 관리
              </NavLink>
            ) : null}
            {displayName ? (
              <span className="hidden items-center gap-2 text-sm text-muted sm:inline-flex">
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-ink"
                >
                  {initial}
                </span>
                <span className="max-w-48 truncate">{displayName}</span>
              </span>
            ) : null}
            <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm" className="min-h-11 gap-1.5 px-2.5 text-muted hover:text-ink sm:min-h-9">
                <LogOut aria-hidden="true" className="size-4" />
                로그아웃
              </Button>
            </form>
          </div>
        </div>
        {showNav ? (
          <nav aria-label="주 메뉴" className="wrap hidden h-11 items-stretch gap-1 overflow-x-auto sm:flex">
            {APP_NAV.map((item) => (
              <NavLink key={item.href} href={item.href} exact={"exact" in item ? item.exact : false} icon={NAV_ICONS[item.href]}>
                {item.label}
              </NavLink>
            ))}
            {isAdmin ? (
              <NavLink href="/admin/users" icon={<ShieldCheck strokeWidth={1.9} />} className="ml-auto">
                사용자 관리
              </NavLink>
            ) : null}
          </nav>
        ) : null}
      </header>
      <main
        id="main"
        className={cn(
          "wrap flex-1 py-6 sm:py-10",
          showNav && "pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1.5rem)] sm:pb-12",
        )}
      >
        {children}
      </main>
      {showNav ? (
        <nav
          aria-label="주 메뉴"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 sm:hidden"
        >
          <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-lg items-stretch px-1">
            {APP_NAV.map((item) => (
              <li key={item.href} className="flex flex-1">
                <NavLink href={item.href} exact={"exact" in item ? item.exact : false} variant="bottom" icon={NAV_ICONS[item.href]}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
