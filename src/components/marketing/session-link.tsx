"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isSignedInSession } from "@/lib/auth-core/session-hint";

// 정적 소개 페이지에서 로그인 상태에 따라 링크 문구·목적지만 바꾼다. 서버에서 세션을 읽으면 페이지 전체가 동적이 되므로
// 처음에는 로그아웃 상태로 그리고, 브라우저에서 같은 출처의 세션 엔드포인트(사용자 id 만 돌려준다)를 한 번 확인해 바꾼다.
// 요청이 실패하거나 응답 형식이 다르면 로그아웃 상태 그대로 둔다. 접근 제어가 아니다 — /app 의 서버 가드가 실제로 판정한다.
const SignedInContext = createContext(false);

/** 소개 페이지 전체에서 세션을 한 번만 확인한다(링크마다 요청하지 않는다). 언마운트되면 요청을 취소한다. */
export function SessionHintProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!controller.signal.aborted && isSignedInSession(data)) setSignedIn(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return <SignedInContext value={signedIn}>{children}</SignedInContext>;
}

export function SessionLink({
  signedOutHref,
  signedOutLabel,
  signedInHref = "/app",
  signedInLabel,
  hideWhenSignedIn = false,
  className,
  trailing,
}: {
  signedOutHref: string;
  signedOutLabel: string;
  signedInHref?: string;
  /** 로그인 상태에서 보일 문구. hideWhenSignedIn 이면 쓰지 않는다. */
  signedInLabel?: string;
  /** 로그인 상태에서는 링크를 숨긴다(예: 머리의 보조 「로그인」 버튼). */
  hideWhenSignedIn?: boolean;
  className?: string;
  /** 라벨 뒤 장식(예: 화살표 아이콘). 두 상태 모두 보인다. */
  trailing?: ReactNode;
}) {
  const signedIn = useContext(SignedInContext);
  if (signedIn && hideWhenSignedIn) return null;
  const on = signedIn && signedInLabel !== undefined;
  return (
    <Link href={on ? signedInHref : signedOutHref} className={className}>
      {on ? signedInLabel : signedOutLabel}
      {trailing}
    </Link>
  );
}
