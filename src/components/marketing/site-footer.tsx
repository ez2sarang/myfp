import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-10 text-sm text-muted">
      <div className="wrap flex flex-wrap items-center justify-between gap-4">
        <p>
          © {new Date().getFullYear()} {SITE_NAME}. 개인 재무 기록 도구이며 금융 자문을 제공하지 않습니다.
        </p>
        <nav aria-label="법적 고지" className="flex gap-4">
          <Link href="/privacy" className="hover:text-ink">
            개인정보 처리방침
          </Link>
          <Link href="/terms" className="hover:text-ink">
            이용약관
          </Link>
        </nav>
      </div>
    </footer>
  );
}
