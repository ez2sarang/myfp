// 공유 보기 해석 (Db 주입, 프레임워크 없음). 페이지는 결과가 null 이면 notFound() 만 부른다.
// 형식 오류·없는 토큰·만료·폐기·소유자 비활성은 모두 똑같이 null 이다(어떤 이유로 실패했는지 바깥에서 구별할 수 없다).
// 열람 기록(view_count, last_viewed_at)은 실패해도 보기를 막지 않는다.
import { listBalances } from "../db/queries/balance.ts";
import { listFixed } from "../db/queries/fixed.ts";
import { findShareByTokenHash, recordShareView } from "../db/queries/share.ts";
import type { Db } from "../db/types.ts";
import { hashShareToken, isWellFormedToken, shareLinkState } from "./token.ts";
import { buildShareView, type ShareListParams, type ShareView } from "./view.ts";

export async function resolveShareView(db: Db, rawToken: unknown, now: Date = new Date(), params: ShareListParams = {}): Promise<ShareView | null> {
  if (!isWellFormedToken(rawToken)) return null;
  const link = await findShareByTokenHash(db, hashShareToken(rawToken));
  if (!link || link.ownerStatus !== "active" || shareLinkState(link, now) !== "active") return null;
  const [fixed, balances] = await Promise.all([
    link.scopes.includes("summary") || link.scopes.includes("fixed") ? listFixed(db, link.ownerId) : Promise.resolve([]),
    link.scopes.includes("balances") ? listBalances(db, link.ownerId) : Promise.resolve([]),
  ]);
  try {
    await recordShareView(db, link.id);
  } catch {
    // 열람 기록 실패는 무시한다
  }
  return buildShareView({ scopes: link.scopes, masks: link.masks, createdAt: link.createdAt, expiresAt: link.expiresAt, fixed, balances }, now, params);
}
