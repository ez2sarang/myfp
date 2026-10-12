import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { FixedForm } from "@/components/fixed/fixed-form";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { updateFixedAction } from "@/lib/actions/fixed";
import { db } from "@/lib/db/pool";
import { getFixed } from "@/lib/db/queries/fixed";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "고정지출 수정" };

export default async function EditFixedPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireActiveUser("/app/fixed");
  const { id } = await params;
  // 다른 사용자의 항목은 user_id 조건에 걸려 찾을 수 없다(없는 항목과 같은 404).
  const item = await getFixed(db, viewer.id, id);
  if (!item) notFound();
  return (
    <>
      <PageHeader
        title="고정지출 수정"
        description={item.name}
        actions={
          <Link href="/app/fixed" className={buttonClass("secondary", "sm", "min-h-11 sm:min-h-9")}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            목록으로
          </Link>
        }
      />
      <Card className="max-w-4xl">
        <CardBody className="py-6 sm:px-6">
          <FixedForm action={updateFixedAction} item={item} submitLabel="저장" />
        </CardBody>
      </Card>
    </>
  );
}
