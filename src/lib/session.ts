// 서버 전용 신뢰 경계: 로그인 상태·계정 상태·관리자 여부를 매 요청 DB 기준으로 판정한다.
// proxy 는 세션 쿠키만 보는 거친 관문이므로 모든 보호 페이지·서버 액션·라우트 핸들러가 이 함수들을 직접 부른다.
// 사용자 데이터의 소유자는 항상 여기서 돌려준 viewer.id 다(클라이언트가 보낸 사용자 id 는 쓰지 않는다).
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildLoginUrl } from "@/lib/auth-core/callback-url";
import { decideGate, decideShareAccess, isActiveAdmin } from "@/lib/auth-core/gate";
import { db } from "@/lib/db/pool";
import { getUserRecord, type UserRecord } from "@/lib/db/queries/users";

export type Viewer = UserRecord;

export const PENDING_PATH = "/app/pending";

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  // 세션은 유효하지만 DB 에 사용자가 없으면(초기화 등) 비로그인으로 본다.
  return getUserRecord(db, userId);
});

/** 로그인만 확인한다 (가입 대기 안내 화면용). */
export async function requireUser(callbackPath = "/app"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(buildLoginUrl(callbackPath));
  return viewer;
}

/** 로그인 + 활성 계정. 가입 대기·차단 계정은 안내 화면으로 보낸다. */
export async function requireActiveUser(callbackPath = "/app"): Promise<Viewer> {
  const viewer = await getViewer();
  const gate = decideGate(viewer);
  if (gate === "login") redirect(buildLoginUrl(callbackPath));
  if (gate !== "ok") redirect(PENDING_PATH);
  return viewer as Viewer;
}

/**
 * 공유 보기 전용 가드: 로그인한 active·pending 사용자만. 비로그인은 로그인 뒤 같은 공유 주소로 돌아오게 보낸다.
 * blocked 는 blocked=true 로 돌려주고, 페이지는 데이터 없이 안내만 보여 준다. /app·/admin 가드(requireActiveUser·requireAdmin)와 섞어 쓰지 않는다.
 */
export async function requireShareViewer(callbackPath: string): Promise<{ viewer: Viewer; blocked: boolean }> {
  const viewer = await getViewer();
  const access = decideShareAccess(viewer);
  if (access === "login") redirect(buildLoginUrl(callbackPath));
  return { viewer: viewer as Viewer, blocked: access === "blocked" };
}

/** 활성 관리자만. 그 외에는 404 로 존재를 숨긴다(비로그인은 로그인으로). */
export async function requireAdmin(callbackPath = "/admin/users"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(buildLoginUrl(callbackPath));
  if (!isActiveAdmin(viewer)) notFound();
  return viewer;
}
