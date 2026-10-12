#!/usr/bin/env node
// 비상용 관리자 비밀번호 해시 생성기. 비밀번호는 표준입력의 첫 줄로만 받는다 (인자·환경 변수·로그에 남기지 않는다).
//
//   node scripts/hash-password.mjs            # 터미널에서 입력한 뒤 Enter (입력은 화면에 보일 수 있으니 파이프 사용 권장)
//   printf '%s' "$PW" | node scripts/hash-password.mjs
//
// 출력은 ADMIN_BOOTSTRAP_PASSWORD_HASH 에 넣을 해시 한 줄뿐이다.
import { createInterface } from "node:readline";
import { hashPassword } from "../src/lib/auth-core/password.ts";

async function readFirstLine() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    rl.close();
    return line;
  }
  return "";
}

const password = await readFirstLine();
if (password.length < 12) {
  console.error("비밀번호는 12자 이상이어야 합니다.");
  process.exit(1);
}
console.log(await hashPassword(password));
