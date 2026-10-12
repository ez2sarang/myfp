"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

// 스위치 한 칸: 눌러서 서버 액션으로 반대 값을 보낸다. 표시는 서버에서 내려온 checked 만 따른다
// (거부되면 값이 그대로이고 사유가 옆에 보인다).
export function ToggleForm({
  action,
  hidden,
  checked,
  label,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  checked: boolean;
  /** 화면 낭독기에 읽히는 이름 */
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="value" value={checked ? "0" : "1"} />
      <button
        type="submit"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={pending}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-transparent bg-btn" : "border-line-strong bg-bg-alt",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("absolute left-0.5 top-0.5 size-4.5 rounded-full transition-transform", checked ? "translate-x-5 bg-btn-ink" : "bg-ink")}
        />
      </button>
      {state && !state.ok ? (
        <span role="alert" className="max-w-48 text-xs text-danger">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
