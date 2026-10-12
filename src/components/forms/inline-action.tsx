"use client";

import { useActionState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

// 버튼 하나짜리 서버 액션 폼 (보관·삭제·폐기 같은 행 동작). confirmText 를 주면 실행 전에 확인을 받는다.
export function InlineAction({
  action,
  hidden,
  label,
  variant = "secondary",
  confirmText,
  ariaLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  label: string;
  variant?: ButtonVariant;
  confirmText?: string;
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={variant} size="sm" disabled={pending} aria-label={ariaLabel}>
        {label}
      </Button>
      {state && !state.ok ? (
        <span role="alert" className={cn("max-w-48 text-xs text-danger")}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
