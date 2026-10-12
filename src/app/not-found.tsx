import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const NOT_FOUND_TITLE = "페이지를 찾을 수 없습니다";

// 없는 주소, 접근할 수 없는 화면, 무효·만료·폐기된 공유 링크가 모두 이 같은 화면과 제목을 쓴다(어떤 이유인지 드러내지 않는다).
export const metadata: Metadata = { title: NOT_FOUND_TITLE, robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main id="main" className="wrap flex min-h-[70dvh] flex-col items-center justify-center py-24">
      <p aria-hidden="true" className="num mb-6 font-mono text-sm font-medium text-brand">404</p>
      <EmptyState
        className="w-full max-w-xl"
        title={NOT_FOUND_TITLE}
        description="주소가 바뀌었거나, 만료되었거나, 접근할 수 없는 페이지입니다."
        action={
          <Link href="/" className={buttonClass("secondary", "md")}>
            처음으로 돌아가기
          </Link>
        }
      />
    </main>
  );
}
