// 공유 보기 해석 (Db 주입, 프레임워크 없음). 페이지는 열람자 가드(requireShareViewer)를 먼저 통과시킨 뒤 이 함수를 부르고, 결과가 null 이면 notFound() 만 부른다.
// 형식 오류·없는 토큰·만료·폐기·소유자 비활성·지원하지 않는 열람 대상(audience)은 모두 똑같이 null 이다(실패 이유를 바깥에서 구별할 수 없다).
// 열람 기록(view_count, last_viewed_at)은 로그인한 열람자가 소유자가 아닐 때만 남기고, 실패해도 보기를 막지 않는다. 열람자 신원은 기록하지 않는다.
import { listBalances } from "../db/queries/balance.ts";
import { listFixed } from "../db/queries/fixed.ts";
import { findShareByTokenHash, recordShareView } from "../db/queries/share.ts";
import type { Db } from "../db/types.ts";
import { hashShareToken, isWellFormedToken, shareLinkState } from "./token.ts";
import { buildShareView, type ShareListParams, type ShareView } from "./view.ts";

export async function resolveShareView(
  db: Db,
  rawToken: unknown,
  now: Date = new Date(),
  params: ShareListParams = {},
  viewerId: string | null = null,
): Promise<ShareView | null> {
  if (!isWellFormedToken(rawToken)) return null;
  const link = await findShareByTokenHash(db, hashShareToken(rawToken));
  if (!link || link.ownerStatus !== "active" || shareLinkState(link, now) !== "active") return null;
  // 지정 회원 공유(designated)는 아직 구현하지 않았다: 만나면 열람을 거부한다(members 와 열이 없는 경우만 허용).
  if (link.audience !== null && link.audience !== "members") return null;
  const [fixed, balances] = await Promise.all([
    link.scopes.includes("summary") || link.scopes.includes("fixed") ? listFixed(db, link.ownerId) : Promise.resolve([]),
    link.scopes.includes("balances") ? listBalances(db, link.ownerId) : Promise.resolve([]),
  ]);
  if (viewerId !== null && viewerId !== link.ownerId) {
    try {
      await recordShareView(db, link.id);
    } catch {
      // 열람 기록 실패는 무시한다
    }
  }
  return buildShareView({ scopes: link.scopes, masks: link.masks, createdAt: link.createdAt, expiresAt: link.expiresAt, fixed, balances }, now, params);
}
