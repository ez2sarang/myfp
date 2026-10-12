"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

// 공급자 이름·표시 이름이 모두 없는 사용자에게만 서버가 그리는 한 줄 안내. 닫으면 이 브라우저(localStorage)에서만 다시 뜨지 않는다(서버 상태 없음).
const KEY = "myfp:display-name-hint-dismissed";
const listeners = new Set<() => void>();
let closedHere = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismissed(): boolean {
  if (closedHere) return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function DisplayNameHint() {
  // 서버 렌더와 첫 하이드레이션에서는 숨겨 두고(true), 브라우저 값으로 결정한다
  const hidden = useSyncExternalStore(subscribe, dismissed, () => true);
  if (hidden) return null;
  const close = () => {
    closedHere = true;
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // 저장소를 쓸 수 없으면 이 페이지를 떠나기 전까지만 닫힌다
    }
    for (const l of listeners) l();
  };
  return (
    <div role="note" className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-muted sm:px-5">
      <p className="flex-1">
        <Link href="/app/settings#display-name" className="font-medium text-brand underline underline-offset-4">
          표시 이름
        </Link>
        을 정하면 문의·차단 같은 운영 때 본인 계정을 구분하기 쉬워요. 선택 사항입니다.
      </p>
      <button type="button" onClick={close} aria-label="안내 닫기" className="-m-2 flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-bg-alt hover:text-ink">
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
