"use server";

// 설정 화면 서버 액션: 표시 이름 저장·지우기, 내 데이터 전체 삭제, 계정 삭제. assertSameOrigin → requireActiveUser 순서로 시작하고,
// 삭제는 확인 문구가 정확히 일치해야 한다. 대상은 언제나 세션 사용자(viewer.id)이며 폼이 보낸 사용자 id 는 읽지 않는다.
import { revalidatePath } from "next/cache";
import { validateDisplayName } from "@/lib/account/display-name";
import { db, withTransaction } from "@/lib/db/pool";
import { signOut } from "@/lib/auth";
import { deleteAccount, deleteAllUserData } from "@/lib/db/queries/account";
import { setDisplayName } from "@/lib/db/queries/users";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireActiveUser } from "@/lib/session";
import { ACCOUNT_DELETE_PHRASE, DELETE_CONFIRM_PHRASE, type ActionState } from "./state";

// 이름 저장은 이름 관문의 유일한 예외(allowNoName): 이름이 없는 사용자가 이름 입력 화면(/app/welcome)에서 처음 이름을 정할 때도 이 액션을 쓴다.
export async function updateDisplayNameAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/settings", { allowNoName: true });
  let value: string | null = null;
  if (formData.get("intent") !== "clear") {
    const checked = validateDisplayName(formData.get("displayName"));
    if (!checked.ok) return { ok: false, message: checked.message, values: { displayName: String(formData.get("displayName") ?? "").slice(0, 100) } };
    value = checked.value;
  }
  try {
    await setDisplayName(db, viewer.id, value);
  } catch (error) {
    // 0005 적용 전(42703 열 없음) 등: 저장하지 않고 안내만
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    console.error("[account]", error instanceof Error ? error.name : "Error", code);
    return { ok: false, message: "표시 이름을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: value === null ? "표시 이름을 지웠습니다." : "표시 이름을 저장했습니다." };
}

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
  return { ok: true, message: "고정지출·예정지출·자산/부채·공유 링크를 모두 삭제했습니다." };
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
