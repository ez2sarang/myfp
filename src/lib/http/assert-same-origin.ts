// 서버 전용: 서버 액션의 첫 문장으로 부른다(세션·권한 확인보다 먼저). 같은 사이트의 Origin 이 아니면 notFound() 로 거부한다 (존재를 숨김).
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { enforceSameOrigin } from "./origin";

export async function assertSameOrigin(): Promise<void> {
  enforceSameOrigin(await headers(), process.env.AUTH_URL, notFound);
}
