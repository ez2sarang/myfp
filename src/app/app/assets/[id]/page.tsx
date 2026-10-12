import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { BalanceForm } from "@/components/balance/balance-form";
import { Card, CardBody } from "@/components/ui/card";
import { updateBalanceAction } from "@/lib/actions/balance";
import { db } from "@/lib/db/pool";
import { getBalance } from "@/lib/db/queries/balance";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "자산·부채 수정" };

export default async function EditBalancePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireActiveUser("/app/assets");
  const { id } = await params;
  // 다른 사용자의 항목은 user_id 조건에 걸려 찾을 수 없다(없는 항목과 같은 404).
  const item = await getBalance(db, viewer.id, id);
  if (!item) notFound();
  return (
    <>
      <PageHeader
        title="자산·부채 수정"
        description={item.name}
        actions={
          <Link href="/app/assets" className="font-semibold text-brand underline underline-offset-4">
            목록으로
          </Link>
        }
      />
      <Card>
        <CardBody>
          <BalanceForm action={updateBalanceAction} item={item} submitLabel="저장" defaultKind={item.kind} />
        </CardBody>
      </Card>
    </>
  );
}
