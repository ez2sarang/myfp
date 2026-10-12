// 비밀번호 해시 (순수 모듈, Node crypto 의 scrypt). 저장 형식: scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>
// 구분자로 `$` 를 쓰지 않는다: .env 파일의 변수 확장(`$VAR`)에 값이 훼손되는 것을 막기 위해서다.
// 평문 비밀번호는 어디에도 저장하지 않는다. 비교는 timingSafeEqual 로 한다.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const SCRYPT_DEFAULTS = { N: 32768, r: 8, p: 1, keyLength: 64, saltLength: 16 } as const;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_N = 1 << 20;

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

function maxmemFor(N: number, r: number, p: number): number {
  return 128 * r * (N + p + 2) * 2;
}

export interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

export function parseHash(stored: string | undefined): ParsedHash | null {
  if (typeof stored !== "string") return null;
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null;
  if (N > MAX_N || (N & (N - 1)) !== 0 || r > 32 || p > 16) return null;
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const hash = Buffer.from(parts[5] ?? "", "base64url");
  if (salt.length < 8 || hash.length < 16) return null;
  return { N, r, p, salt, hash };
}

export function looksLikeHash(stored: string | undefined): boolean {
  return parseHash(stored) !== null;
}

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length === 0 || plain.length > MAX_PASSWORD_LENGTH) {
    throw new Error("비밀번호 길이가 올바르지 않습니다.");
  }
  const { N, r, p, keyLength, saltLength } = SCRYPT_DEFAULTS;
  const salt = randomBytes(saltLength);
  const derived = await scryptAsync(plain, salt, keyLength, { N, r, p, maxmem: maxmemFor(N, r, p) });
  return ["scrypt", N, r, p, salt.toString("base64url"), derived.toString("base64url")].join(":");
}

export async function verifyPassword(plain: unknown, stored: string | undefined): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed || typeof plain !== "string" || plain.length === 0 || plain.length > MAX_PASSWORD_LENGTH) return false;
  try {
    const derived = await scryptAsync(plain, parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: maxmemFor(parsed.N, parsed.r, parsed.p),
    });
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}
