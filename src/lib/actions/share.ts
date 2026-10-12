"use server";

// 공유 링크 서버 액션. assertSameOrigin → requireActiveUser 순서로 시작한다.
// 토큰 원문은 생성 응답으로 한 번만 돌려주고 어디에도 저장·기록하지 않는다(DB 에는 해시만).
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { withTransaction } from "@/lib/db/pool";
import { createShareLink, revokeShareLink } from "@/lib/db/queries/share";
import { LIMITS } from "@/lib/finance/types";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { requireActiveUser } from "@/lib/session";
import { parseShareInput } from "@/lib/share/options";
import { generateShareToken, shareUrl } from "@/lib/share/token";
import { formFields, type ActionState } from "./state";

const FAILED: ActionState = { ok: false, message: "처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요." };

/** 공유 주소의 기준: AUTH_URL(배포 주소). 없으면 같은 사이트 요청의 Origin(assertSameOrigin 을 통과한 값). */
async function siteBase(): Promise<string> {
  try {
    const url = new URL((process.env.AUTH_URL ?? "").trim());
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // 아래로
  }
  return (await headers()).get("origin") ?? "";
}

export async function createShareAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/share");
  const parsed = parseShareInput(formFields(formData), new Date());
  if (!parsed.ok) return { ok: false, message: "입력값을 확인해 주세요.", errors: parsed.errors };
  const { token, hash } = generateShareToken();
  try {
    const result = await withTransaction((tx) => createShareLink(tx, viewer.id, parsed.value, hash));
    if (!result.ok) return { ok: false, message: `사용 중인 공유 링크는 최대 ${LIMITS.activeShareLinks}개입니다. 쓰지 않는 링크를 폐기한 뒤 다시 만들어 주세요.` };
  } catch (error) {
    console.error("[share]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  revalidatePath("/app/share");
  return { ok: true, message: "공유 링크를 만들었습니다. 이 주소는 지금 한 번만 보입니다.", shareUrl: shareUrl(await siteBase(), token) };
}

export async function revokeShareAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/share");
  const id = formData.get("id");
  const revoked = await withTransaction((tx) => revokeShareLink(tx, viewer.id, typeof id === "string" ? id.slice(0, 64) : "")).catch(() => null);
  if (revoked === null) return FAILED;
  if (!revoked) return { ok: false, message: "이미 폐기됐거나 찾을 수 없는 링크입니다." };
  revalidatePath("/app/share");
  return { ok: true, message: "폐기했습니다. 이 링크로는 더 이상 볼 수 없습니다." };
}
