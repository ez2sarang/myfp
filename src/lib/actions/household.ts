"use server";

// 함께 보기(그룹) 서버 액션. 모든 액션은 assertSameOrigin → requireActiveUser 순서로 시작한다(가입 대기·차단 계정은 그룹 기능을 쓸 수 없다).
// 대상 그룹은 언제나 세션 사용자의 구성원 행에서 찾는다(폼의 사용자 id·그룹 id 는 받지 않는다). 구성원 지정은 그룹 안에서 유일한 태그로만.
// 초대 토큰 원문은 생성 응답으로 한 번만 돌려주고 저장·기록하지 않는다(DB 에는 해시만).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTransaction } from "@/lib/db/pool";
import {
  acceptInvite,
  createHousehold,
  createInvite,
  deleteHousehold,
  leaveHousehold,
  removeMember,
  renameHousehold,
  revokeInvite,
  updateMyMembership,
  type HouseholdWrite,
} from "@/lib/db/queries/household";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { siteBase } from "@/lib/http/site-base";
import { MAX_ACTIVE_INVITES, MAX_MEMBERS, parseShareScope, validateHouseholdName, validateTag } from "@/lib/household/rules";
import { requireActiveUser } from "@/lib/session";
import { generateShareToken, hashShareToken, isWellFormedToken } from "@/lib/share/token";
import { formFields, type ActionState } from "./state";

const SETTINGS = "/app/household/settings";
const FAILED: ActionState = { ok: false, message: "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };

const REASONS: Record<Exclude<HouseholdWrite, { ok: true }>["reason"], string> = {
  already_member: "이미 다른 그룹에 속해 있습니다. 한 사람은 한 그룹에만 들어갈 수 있습니다.",
  not_member: "속한 그룹이 없습니다.",
  not_owner: "방장만 할 수 있습니다.",
  not_found: "찾을 수 없습니다.",
  full: `그룹은 최대 ${MAX_MEMBERS}명입니다.`,
  limit: `사용 중인 초대 링크는 최대 ${MAX_ACTIVE_INVITES}개입니다. 쓰지 않는 초대를 취소한 뒤 다시 만들어 주세요.`,
  tag_taken: "그룹 안에서 이미 쓰는 태그입니다. 다른 태그를 입력해 주세요.",
  self: "자기 자신은 내보낼 수 없습니다. 「그룹 나가기」를 쓰세요.",
};

async function run(work: Parameters<typeof withTransaction<HouseholdWrite>>[0], okMessage: string): Promise<ActionState> {
  try {
    const result = await withTransaction(work);
    if (!result.ok) return { ok: false, message: REASONS[result.reason] };
  } catch (error) {
    console.error("[household]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  revalidatePath("/app/household", "layout");
  return { ok: true, message: okMessage };
}

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v.slice(0, 200) : "";
};

export async function createHouseholdAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  const name = validateHouseholdName(text(formData, "name"));
  if (!name.ok) return { ok: false, message: name.message };
  const tag = validateTag(text(formData, "tag"));
  if (!tag.ok) return { ok: false, message: tag.message };
  return run((tx) => createHousehold(tx, viewer.id, name.value, tag.value), "그룹을 만들었습니다. 초대 링크를 만들어 구성원을 초대하세요.");
}

export async function renameHouseholdAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  const name = validateHouseholdName(text(formData, "name"));
  if (!name.ok) return { ok: false, message: name.message };
  return run((tx) => renameHousehold(tx, viewer.id, name.value), "그룹 이름을 바꿨습니다.");
}

export async function createInviteAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  const { token, hash } = generateShareToken();
  const result = await run((tx) => createInvite(tx, viewer.id, hash), "초대 링크를 만들었습니다. 이 주소는 지금 한 번만 보입니다(7일 동안 한 번 쓸 수 있음).");
  if (!result?.ok) return result;
  return { ...result, shareUrl: `${(await siteBase()).replace(/\/+$/, "")}/join/${token}` };
}

export async function revokeInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  const id = text(formData, "id").slice(0, 64);
  try {
    const revoked = await withTransaction((tx) => revokeInvite(tx, viewer.id, id));
    if (!revoked) return { ok: false, message: "이미 쓰였거나 찾을 수 없는 초대입니다." };
  } catch (error) {
    console.error("[household]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  revalidatePath("/app/household", "layout");
  return { ok: true, message: "초대를 취소했습니다." };
}

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/household");
  const token = text(formData, "token");
  if (!isWellFormedToken(token)) return { ok: false, message: REASONS.not_found };
  if (formData.get("consent") !== "on") return { ok: false, message: "동의 문구를 확인하고 체크해 주세요." };
  const tag = validateTag(text(formData, "tag"));
  if (!tag.ok) return { ok: false, message: tag.message };
  const scope = parseShareScope(formFields(formData, 10));
  const result = await run((tx) => acceptInvite(tx, viewer.id, hashShareToken(token), { tag: tag.value, ...scope }), "그룹에 들어왔습니다.");
  if (!result?.ok) return result;
  redirect("/app/household");
}

export async function updateMembershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  const tag = validateTag(text(formData, "tag"));
  if (!tag.ok) return { ok: false, message: tag.message };
  const scope = parseShareScope(formFields(formData, 10));
  return run((tx) => updateMyMembership(tx, viewer.id, { tag: tag.value, ...scope }), "저장했습니다.");
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  const tag = validateTag(text(formData, "tag"));
  if (!tag.ok) return { ok: false, message: REASONS.not_found };
  return run((tx) => removeMember(tx, viewer.id, tag.value), "구성원을 내보냈습니다. 그 사람의 데이터는 즉시 합산에서 빠집니다.");
}

export async function leaveHouseholdAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  return run((tx) => leaveHousehold(tx, viewer.id), "그룹에서 나왔습니다. 내 데이터는 즉시 그룹에서 빠집니다.");
}

export async function deleteHouseholdAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await assertSameOrigin();
  const viewer = await requireActiveUser(SETTINGS);
  return run((tx) => deleteHousehold(tx, viewer.id), "그룹을 지웠습니다.");
}
