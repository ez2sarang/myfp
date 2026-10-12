"use server";

// 고정지출 서버 액션. 모든 액션은 assertSameOrigin(Origin 필수, 같은 사이트만) → requireActiveUser(세션·계정 상태 재확인) 순서로 시작한다.
// 데이터 소유자는 세션의 viewer.id 뿐이다. 폼의 user_id 같은 값은 읽지 않는다. 항목 id 는 쿼리에서 user_id 와 함께 조건으로 쓴다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTransaction } from "@/lib/db/pool";
import { createFixed, deleteFixed, setFixedActive, setFixedArchived, updateFixed } from "@/lib/db/queries/fixed";
import { seoulToday } from "@/lib/finance/dates";
import { LIMITS } from "@/lib/finance/types";
import { parseFixedInput } from "@/lib/finance/validate";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireActiveUser } from "@/lib/session";
import { formFields, type ActionState } from "./state";

const FAILED: ActionState = { ok: false, message: "처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요." };

function idOf(formData: FormData): string {
  const value = formData.get("id");
  return typeof value === "string" ? value.slice(0, 64) : "";
}

export async function createFixedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/fixed");
  const fields = formFields(formData);
  const parsed = parseFixedInput(fields, seoulToday());
  if (!parsed.ok) return { ok: false, message: "입력값을 확인해 주세요.", errors: parsed.errors, values: fields };
  try {
    const result = await withTransaction((tx) => createFixed(tx, viewer.id, parsed.value));
    if (!result.ok) return { ok: false, message: `고정지출은 최대 ${LIMITS.fixedExpenses}건까지 등록할 수 있습니다.` };
  } catch (error) {
    console.error("[fixed]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "추가했습니다." };
}

export async function updateFixedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/fixed");
  const fields = formFields(formData);
  const parsed = parseFixedInput(fields, seoulToday());
  if (!parsed.ok) return { ok: false, message: "입력값을 확인해 주세요.", errors: parsed.errors, values: fields };
  let found = false;
  try {
    const result = await withTransaction((tx) => updateFixed(tx, viewer.id, idOf(formData), parsed.value));
    found = result.ok;
  } catch (error) {
    console.error("[fixed]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  if (!found) return { ok: false, message: "항목을 찾을 수 없습니다." };
  revalidatePath("/app", "layout");
  redirect("/app/fixed");
}

export async function toggleFixedActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/fixed");
  const active = formData.get("value") === "1";
  const changed = await withTransaction((tx) => setFixedActive(tx, viewer.id, idOf(formData), active)).catch(() => null);
  if (changed === null) return FAILED;
  if (!changed) return { ok: false, message: "항목을 찾을 수 없습니다." };
  revalidatePath("/app", "layout");
  return { ok: true, message: active ? "활성으로 바꿨습니다." : "비활성으로 바꿨습니다." };
}

export async function archiveFixedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/fixed");
  const archived = formData.get("value") !== "0";
  const changed = await withTransaction((tx) => setFixedArchived(tx, viewer.id, idOf(formData), archived)).catch(() => null);
  if (changed === null) return FAILED;
  if (!changed) return { ok: false, message: "항목을 찾을 수 없습니다." };
  revalidatePath("/app", "layout");
  return { ok: true, message: archived ? "보관했습니다." : "보관을 해제했습니다." };
}

export async function deleteFixedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/fixed");
  const deleted = await withTransaction((tx) => deleteFixed(tx, viewer.id, idOf(formData))).catch(() => null);
  if (deleted === null) return FAILED;
  if (!deleted) return { ok: false, message: "항목을 찾을 수 없습니다." };
  revalidatePath("/app", "layout");
  return { ok: true, message: "삭제했습니다." };
}
