// 공유 링크 토큰 (순수 모듈, Node crypto).
//  - 토큰: 256비트 CSPRNG(randomBytes(32)) 를 base64url 로 (43자). 원문은 생성 직후 한 번만 사용자에게 보여 주고 저장하지 않는다.
//  - DB 에는 SHA-256 해시(16진수 64자)만 저장하고, 조회는 해시 일치로 한다.
//  - 형식이 틀린 토큰은 DB 를 조회하지 않고 바로 "없음"으로 처리한다(무효·만료·폐기와 같은 404).
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateShareToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashShareToken(token) };
}

export function isWellFormedToken(raw: unknown): raw is string {
  return typeof raw === "string" && TOKEN_RE.test(raw);
}

export type ShareLinkState = "active" | "expired" | "revoked";

export function shareLinkState(link: { expiresAt: Date | null; revokedAt: Date | null }, now: Date): ShareLinkState {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

export const EXPIRY_CHOICES = [7, 30, 90] as const;

/** 만료 선택(7/30/90일, never=무기한) → 만료 시각 */
export function expiryFrom(choice: string | undefined, now: Date): { ok: true; expiresAt: Date | null } | { ok: false } {
  if (choice === "never") return { ok: true, expiresAt: null };
  const days = Number(choice);
  if (!(EXPIRY_CHOICES as readonly number[]).includes(days)) return { ok: false };
  return { ok: true, expiresAt: new Date(now.getTime() + days * 86_400_000) };
}

/** 공유 주소. base 는 AUTH_URL(배포 주소) 또는 요청의 origin. 끝 슬래시는 정리한다. */
export function shareUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/s/${token}`;
}
