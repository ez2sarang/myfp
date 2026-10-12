"use server";

// 자산·부채 서버 액션. assertSameOrigin → requireActiveUser 순서로 시작하고, 소유자는 세션의 viewer.id 뿐이다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTransaction } from "@/lib/db/pool";
import { createBalance, deleteBalance, updateBalance } from "@/lib/db/queries/balance";
import { LIMITS } from "@/lib/finance/types";
import { parseBalanceInput } from "@/lib/finance/validate";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireActiveUser } from "@/lib/session";
import { formFields, type ActionState } from "./state";

const FAILED: ActionState = { ok: false, message: "처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요." };

function idOf(formData: FormData): string {
  const value = formData.get("id");
  return typeof value === "string" ? value.slice(0, 64) : "";
}

export async function createBalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/assets");
  const fields = formFields(formData);
  const parsed = parseBalanceInput(fields);
  if (!parsed.ok) return { ok: false, message: "입력값을 확인해 주세요.", errors: parsed.errors, values: fields };
  try {
    const result = await withTransaction((tx) => createBalance(tx, viewer.id, parsed.value));
    if (!result.ok) return { ok: false, message: `자산·부채는 최대 ${LIMITS.balanceItems}건까지 등록할 수 있습니다.` };
  } catch (error) {
    console.error("[balance]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "추가했습니다." };
}

export async function updateBalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/assets");
  const fields = formFields(formData);
  const parsed = parseBalanceInput(fields);
  if (!parsed.ok) return { ok: false, message: "입력값을 확인해 주세요.", errors: parsed.errors, values: fields };
  let found = false;
  try {
    const result = await withTransaction((tx) => updateBalance(tx, viewer.id, idOf(formData), parsed.value));
    found = result.ok;
  } catch (error) {
    console.error("[balance]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  if (!found) return { ok: false, message: "항목을 찾을 수 없습니다." };
  revalidatePath("/app", "layout");
  redirect("/app/assets");
}

export async function deleteBalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/assets");
  const deleted = await withTransaction((tx) => deleteBalance(tx, viewer.id, idOf(formData))).catch(() => null);
  if (deleted === null) return FAILED;
  if (!deleted) return { ok: false, message: "항목을 찾을 수 없습니다." };
  revalidatePath("/app", "layout");
  return { ok: true, message: "삭제했습니다." };
}
