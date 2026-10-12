import { SiteFooter } from "@/components/marketing/site-footer";
import { SessionHintProvider } from "@/components/marketing/session-link";
import { SiteHeader } from "@/components/marketing/site-header";

// 소개·법적 고지 페이지는 정적으로 만든다. 로그인 상태에 따른 링크 문구는 브라우저에서 한 번 확인해 바꾼다(session-link.tsx).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionHintProvider>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </SessionHintProvider>
  );
}
