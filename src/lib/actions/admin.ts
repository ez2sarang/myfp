"use server";

// 관리자 서버 액션: 가입 대기 처리·차단·해제. assertSameOrigin → requireAdmin 순서로 시작하고, 변경은 한 트랜잭션에서 보호 규칙(자기 자신·마지막 관리자)을
// 적용한 뒤 감사 기록을 남긴다. 거부되면 롤백하고 메시지만 돌려준다.
import { revalidatePath } from "next/cache";
import type { GuardResult } from "@/lib/admin/guards";
import { withTransaction } from "@/lib/db/pool";
import { setUserStatus } from "@/lib/db/queries/users";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireAdmin } from "@/lib/session";
import type { ActionState } from "./state";

class Rejected extends Error {
  readonly result: Extract<GuardResult, { ok: false }>;
  constructor(result: Extract<GuardResult, { ok: false }>) {
    super(result.code);
    this.result = result;
  }
}

const LABELS: Record<string, string> = { active: "활성", blocked: "차단", pending: "대기" };

export async function setUserStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const userId = formData.get("userId");
  const status = formData.get("status");
  const target = typeof userId === "string" ? userId.slice(0, 64) : "";
  const next = typeof status === "string" ? status.slice(0, 20) : "";
  try {
    await withTransaction(async (tx) => {
      const r = await setUserStatus(tx, admin.id, target, next);
      if (!r.ok) throw new Rejected(r);
    });
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, message: error.result.message };
    console.error("[admin]", error instanceof Error ? error.name : "Error");
    return { ok: false, message: "처리 중 오류가 발생했습니다." };
  }
  revalidatePath("/admin/users");
  return { ok: true, message: `${LABELS[next] ?? next} 상태로 바꿨습니다.` };
}
