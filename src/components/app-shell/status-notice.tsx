import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const COPY = {
  pending: {
    title: "가입 대기 중입니다",
    description:
      "지금은 가입 인원이 가득 찼거나 운영자가 가입을 잠시 승인제로 운영하고 있어 계정이 대기 상태입니다. 운영자가 처리하면 내 공간(고정지출·자산 관리)을 사용할 수 있으니 잠시 후 이 화면을 새로 고쳐 주세요. 받은 공유 링크는 이 상태에서도 열 수 있습니다.",
  },
  blocked: {
    title: "이용이 제한된 계정입니다",
    description: "이 계정은 현재 사용할 수 없습니다. 문의가 필요하면 사이트 관리자에게 연락해 주세요.",
  },
} as const;

export function StatusNotice({ kind }: { kind: keyof typeof COPY }) {
  const copy = COPY[kind];
  return (
    <div className="mx-auto w-full max-w-2xl py-8 sm:py-16">
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
