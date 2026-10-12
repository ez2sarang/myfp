"use server";

// 설정 화면 서버 액션: 내 데이터 전체 삭제. assertSameOrigin → requireActiveUser 순서로 시작하고, 확인 문구가 정확히 일치해야 한다.
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db/pool";
import { deleteAllUserData } from "@/lib/db/queries/account";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireActiveUser } from "@/lib/session";
import { DELETE_CONFIRM_PHRASE, type ActionState } from "./state";

export async function deleteAllDataAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/settings");
  const confirm = formData.get("confirm");
  if (typeof confirm !== "string" || confirm.trim() !== DELETE_CONFIRM_PHRASE) {
    return { ok: false, message: `확인 문구 「${DELETE_CONFIRM_PHRASE}」를 정확히 입력해 주세요.` };
  }
  try {
    await withTransaction((tx) => deleteAllUserData(tx, viewer.id));
  } catch (error) {
    console.error("[account]", error instanceof Error ? error.name : "Error");
    return { ok: false, message: "삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "고정지출·자산/부채·공유 링크를 모두 삭제했습니다." };
}
