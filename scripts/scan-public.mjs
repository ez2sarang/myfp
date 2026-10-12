#!/usr/bin/env node
// 공개 저장소 반영 전 검사: git 이 추적하거나 커밋 대기 중인 파일에서 비밀값·개인정보로 보이는 패턴을 찾는다. 의존성 없이 Node 만 쓴다.
//
//   node scripts/scan-public.mjs            # git ls-files + 스테이징된 파일 검사
//   node scripts/scan-public.mjs <파일...>  # 지정한 파일만 검사 (시험용)
//
// 발견하면 파일:줄과 규칙 이름만 출력하고(일치한 값은 출력하지 않는다) 종료 코드 1 로 끝난다.
// 허용 목록: 줄에 `scan-public: allow` 주석이 있으면 그 줄은 건너뛴다(가짜 예시 값에만 쓴다).
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

export const RULES = [
  { name: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: "postgres-url-with-password", re: /postgres(?:ql)?:\/\/[^\s:/@'"]+:[^\s@'"]+@/i },
  { name: "postgres-url", re: /postgres(?:ql)?:\/\/[^\s'"]*@[a-z0-9.-]+\.(?:supabase\.(?:co|com)|amazonaws\.com|neon\.tech|render\.com)/i },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "google-oauth-secret", re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
  { name: "openai-anthropic-key", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "scrypt-hash", re: /\bscrypt:\d+:\d+:\d+:[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{16,}/ },
  { name: "secret-assignment", re: /\b(?:AUTH_SECRET|[A-Z_]*CLIENT_SECRET|[A-Z_]*PASSWORD(?:_HASH)?|DATABASE_URL|MIGRATE_DATABASE_URL)\s*=\s*['"]?[^\s'"#]{8,}/ },
  // 긴 base64/base64url 덩어리(40자 이상, 대·소문자·숫자가 섞임): 키·토큰일 가능성. 파일 경로(/ 구분)는 제외한다.
  { name: "long-base64", re: /(?<![A-Za-z0-9+_-])(?=[A-Za-z0-9+_-]*[A-Z])(?=[A-Za-z0-9+_-]*[a-z])(?=[A-Za-z0-9+_-]*\d)[A-Za-z0-9+_-]{40,}={0,2}(?![A-Za-z0-9+_-])/ },
  // 카드 번호 형태 (4-4-4-4, 구분자 공백/하이픈)
  { name: "card-number", re: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/ },
  // 한국 계좌번호 형태 (숫자 2~6 - 숫자 2~6 - 숫자 2~7, 총 10자리 이상) — 날짜(YYYY-MM-DD)는 제외
  { name: "bank-account", re: /(?<![\w-])(?!\d{4}-\d{2}-\d{2}(?![\w-]))\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,3})?(?![\w-])/ },
  // 주민등록번호 형태
  { name: "resident-id", re: /\b\d{6}-[1-4]\d{6}\b/ },
  // 한국 휴대폰 번호 형태
  { name: "phone-number", re: /\b01[016789]-?\d{3,4}-?\d{4}\b/ },
];

// 이메일: 예시 도메인 외의 실제처럼 보이는 주소
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const ALLOWED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "anthropic.com", "users.noreply.github.com"]);

const SKIP_FILES = [/^package-lock\.json$/, /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf)$/i];
const ALLOW_MARK = "scan-public: allow";

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

export function scanText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARK)) return;
    for (const rule of RULES) if (rule.re.test(line)) findings.push({ line: i + 1, rule: rule.name });
    for (const m of line.matchAll(EMAIL_RE)) {
      const domain = (m[1] ?? "").toLowerCase();
      if (!ALLOWED_EMAIL_DOMAINS.has(domain) && !domain.endsWith(".example") && !domain.endsWith(".invalid")) findings.push({ line: i + 1, rule: "email-address" });
    }
  });
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args : trackedFiles();
  const problems = [];

  // .env 파일이 추적되면 안 된다 (.env.example 만 허용)
  for (const f of files) {
    const base = f.split("/").pop() ?? f;
    if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") problems.push(`${f}: tracked-env-file`);
  }

  for (const f of files) {
    if (SKIP_FILES.some((re) => re.test(f))) continue;
    let text;
    try {
      if (statSync(f).size > 2_000_000) continue;
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const finding of scanText(text)) problems.push(`${f}:${finding.line}: ${finding.rule}`);
  }

  if (problems.length > 0) {
    console.error(`공개 저장소 검사 실패: ${problems.length}건 (값은 출력하지 않음)`);
    for (const p of problems) console.error(` - ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(`공개 저장소 검사 통과: 파일 ${files.length}개`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
