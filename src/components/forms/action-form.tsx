"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

// 서버 액션을 부르는 폼. 결과 메시지를 폼 옆에 알려 준다 (성공은 role=status, 실패는 role=alert).
export function ActionForm({
  action,
  children,
  className,
  hidden,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** 숨은 입력으로 함께 보낼 값 */
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("flex flex-wrap items-center gap-2", className)}>
      {hidden ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
      {children}
      {state ? (
        <span role={state.ok ? "status" : "alert"} className={cn("text-xs", state.ok ? "text-positive" : "text-danger")}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
