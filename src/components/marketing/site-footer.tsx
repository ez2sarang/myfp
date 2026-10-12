import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SITE_NAME } from "@/lib/site";
import { NAV } from "./content";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2 text-sm text-muted">
      <div className="wrap grid gap-10 py-14 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex max-w-sm flex-col gap-3">
          <Link href="/" className="flex w-fit items-center gap-2 font-semibold text-ink" aria-label={`${SITE_NAME} 홈`}>
            <BrandMark className="size-6" />
            <span className="tracking-tight">{SITE_NAME}</span>
          </Link>
          <p>매달 나가는 고정지출과 자산·부채를 직접 기록하고 월 단위로 정리하는 개인 재무 도구입니다.</p>
        </div>
        <nav aria-label="소개" className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-ink">둘러보기</p>
          {NAV.map((item) => (
            <Link key={item.href} href={`/${item.href}`} className="w-fit py-1 hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="법적 고지" className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-ink">정책</p>
          <Link href="/privacy" className="w-fit py-1 hover:text-ink">
            개인정보 처리방침
          </Link>
          <Link href="/terms" className="w-fit py-1 hover:text-ink">
            이용약관
          </Link>
          <Link href="/login" className="w-fit py-1 hover:text-ink">
            로그인
          </Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="wrap py-6 text-xs">
          © {new Date().getFullYear()} {SITE_NAME}. 개인 재무 기록 도구이며 금융 자문을 제공하지 않습니다.
        </p>
      </div>
    </footer>
  );
}
