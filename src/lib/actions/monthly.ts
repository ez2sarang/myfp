"use server";

// 월 단위 모델 서버 액션: 예정지출 추가(분할 포함)·수정·상태·삭제, 고정지출 달별 덮어쓰기·되돌리기.
// 모든 액션은 assertSameOrigin → requireActiveUser 순서로 시작하고, 대상은 세션 사용자(viewer.id)의 행뿐이다(폼의 사용자 id 는 읽지 않는다).
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db/pool";
import { clearOverride, createPlanned, deletePlanned, setOverride, setPlannedStatus, updatePlanned } from "@/lib/db/queries/monthly";
import { seoulToday } from "@/lib/finance/dates";
import { monthInEditableRange, parseOverrideInput, parsePlannedInput, parsePlannedStatus } from "@/lib/finance/monthly-validate";
import { LIMITS } from "@/lib/finance/types";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireActiveUser } from "@/lib/session";
import { formFields, type ActionState } from "./state";

const FAILED: ActionState = { ok: false, message: "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
const NOT_FOUND: ActionState = { ok: false, message: "항목을 찾을 수 없습니다." };

const idOf = (formData: FormData, key = "id"): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value.slice(0, 64) : "";
};
const scopeOf = (formData: FormData): "one" | "group" => (formData.get("scope") === "group" ? "group" : "one");

function failed(error: unknown): ActionState {
  console.error("[monthly]", error instanceof Error ? error.name : "Error");
  return FAILED;
}

export async function createPlannedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app?tab=planned");
  const fields = formFields(formData, 200);
  const parsed = parsePlannedInput(fields, seoulToday(), { allowCount: true });
  if (!parsed.ok) return { ok: false, message: "입력값을 확인해 주세요.", errors: parsed.errors, values: fields };
  try {
    const result = await withTransaction((tx) => createPlanned(tx, viewer.id, parsed.value));
    if (!result.ok) return { ok: false, message: `예정지출은 최대 ${LIMITS.plannedExpenses}건까지 등록할 수 있습니다.`, values: fields };
    revalidatePath("/app", "layout");
    return { ok: true, message: result.count > 1 ? `${result.count}개월로 나눠 추가했습니다.` : "추가했습니다." };
  } catch (error) {
    return failed(error);
  }
}

export async function updatePlannedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app?tab=planned");
  const fields = formFields(formData, 200);
  const parsed = parsePlannedInput(fields, seoulToday(), { allowCount: false });
  if (!parsed.ok) return { ok: false, message: Object.values(parsed.errors)[0] ?? "입력값을 확인해 주세요.", errors: parsed.errors };
  try {
    const result = await withTransaction((tx) => updatePlanned(tx, viewer.id, idOf(formData), parsed.value, scopeOf(formData)));
    if (!result.ok) return NOT_FOUND;
    revalidatePath("/app", "layout");
    return { ok: true, message: result.count > 1 ? `묶음 ${result.count}건을 바꿨습니다.` : "저장했습니다." };
  } catch (error) {
    return failed(error);
  }
}

export async function setPlannedStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app?tab=planned");
  const status = parsePlannedStatus(formData.get("status"));
  if (!status) return { ok: false, message: "알 수 없는 상태입니다." };
  try {
    const changed = await withTransaction((tx) => setPlannedStatus(tx, viewer.id, idOf(formData), status));
    if (!changed) return NOT_FOUND;
    revalidatePath("/app", "layout");
    return { ok: true, message: "바꿨습니다." };
  } catch (error) {
    return failed(error);
  }
}

export async function deletePlannedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app?tab=planned");
  try {
    const deleted = await withTransaction((tx) => deletePlanned(tx, viewer.id, idOf(formData), scopeOf(formData)));
    if (deleted === 0) return NOT_FOUND;
    revalidatePath("/app", "layout");
    return { ok: true, message: `${deleted}건을 삭제했습니다.` };
  } catch (error) {
    return failed(error);
  }
}

export async function setOverrideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app?tab=planned");
  const parsed = parseOverrideInput(formFields(formData, 100), seoulToday());
  if (!parsed.ok) return { ok: false, message: Object.values(parsed.errors)[0] ?? "입력값을 확인해 주세요." };
  try {
    const result = await withTransaction((tx) => setOverride(tx, viewer.id, idOf(formData, "fixedId"), parsed.value));
    if (!result.ok) return result.reason === "limit" ? { ok: false, message: `달별 변경은 최대 ${LIMITS.fixedOverrides}건까지 저장할 수 있습니다.` } : NOT_FOUND;
    revalidatePath("/app", "layout");
    return { ok: true, message: parsed.value.skipped ? "이 달은 건너뜁니다." : "이 달 금액을 바꿨습니다." };
  } catch (error) {
    return failed(error);
  }
}

export async function clearOverrideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app?tab=planned");
  const month = String(formData.get("month") ?? "").slice(0, 7);
  if (!monthInEditableRange(month, seoulToday())) return { ok: false, message: "바꿀 수 없는 달입니다." };
  try {
    const cleared = await withTransaction((tx) => clearOverride(tx, viewer.id, idOf(formData, "fixedId"), month));
    if (!cleared) return NOT_FOUND;
    revalidatePath("/app", "layout");
    return { ok: true, message: "원래 금액으로 되돌렸습니다." };
  } catch (error) {
    return failed(error);
  }
}
