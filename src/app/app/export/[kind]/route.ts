// CSV 내보내기 (GET). proxy 를 통과했더라도 여기서 세션·계정 상태를 다시 확인하고, 세션 사용자의 데이터만 내보낸다.
import { notFound } from "next/navigation";
import { db } from "@/lib/db/pool";
import { listBalances } from "@/lib/db/queries/balance";
import { listFixed } from "@/lib/db/queries/fixed";
import { balanceCsv, fixedCsv } from "@/lib/finance/export";
import { seoulToday } from "@/lib/finance/dates";
import { requireActiveUser } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const viewer = await requireActiveUser("/app/settings");
  const { kind } = await params;
  let body: string;
  if (kind === "fixed") body = fixedCsv(await listFixed(db, viewer.id));
  else if (kind === "balances") body = balanceCsv(await listBalances(db, viewer.id));
  else notFound();
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="myfp-${kind}-${seoulToday()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
