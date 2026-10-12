"use server";

// 설정 화면 서버 액션: 내 데이터 전체 삭제, 계정 삭제. assertSameOrigin → requireActiveUser 순서로 시작하고, 확인 문구가 정확히 일치해야 한다.
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db/pool";
import { signOut } from "@/lib/auth";
import { deleteAccount, deleteAllUserData } from "@/lib/db/queries/account";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireActiveUser } from "@/lib/session";
import { ACCOUNT_DELETE_PHRASE, DELETE_CONFIRM_PHRASE, type ActionState } from "./state";

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

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/settings");
  const confirm = formData.get("confirm");
  if (typeof confirm !== "string" || confirm.trim() !== ACCOUNT_DELETE_PHRASE) {
    return { ok: false, message: `확인 문구 「${ACCOUNT_DELETE_PHRASE}」를 정확히 입력해 주세요.` };
  }
  let result: Awaited<ReturnType<typeof deleteAccount>>;
  try {
    result = await withTransaction((tx) => deleteAccount(tx, viewer.id));
  } catch (error) {
    // 권한 부족(42501) 등 DB 오류: 아무것도 지우지 않은 채(롤백) 문의 안내
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    console.error("[account]", error instanceof Error ? error.name : "Error", code);
    return { ok: false, message: "계정을 삭제하지 못했습니다. 아무것도 지워지지 않았습니다. 잠시 뒤 다시 시도하거나 운영자에게 문의해 주세요." };
  }
  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === "last_admin" ? "마지막 관리자 계정은 삭제할 수 없습니다. 다른 관리자를 먼저 지정해 주세요." : "계정을 찾을 수 없습니다.",
    };
  }
  // 세션 쿠키를 지우고 처음 화면으로 (redirect 를 던진다)
  await signOut({ redirectTo: "/" });
  return { ok: true, message: "계정을 삭제했습니다." };
}
