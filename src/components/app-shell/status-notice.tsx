import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const COPY = {
  pending: {
    title: "승인을 기다리고 있습니다",
    description: "가입은 완료되었습니다. 관리자가 승인하면 myfp 를 사용할 수 있습니다. 승인되면 이 화면을 새로 고쳐 주세요.",
  },
  blocked: {
    title: "이용이 제한된 계정입니다",
    description: "이 계정은 현재 사용할 수 없습니다. 문의가 필요하면 사이트 관리자에게 연락해 주세요.",
  },
} as const;

export function StatusNotice({ kind }: { kind: keyof typeof COPY }) {
  const copy = COPY[kind];
  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <EmptyState
        title={copy.title}
        description={copy.description}
        action={
          <Link href="/" className={buttonClass("secondary", "md")}>
            소개 페이지로 이동
          </Link>
        }
      />
    </div>
  );
}
