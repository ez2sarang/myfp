"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

// 내 데이터 전체 삭제: 확인 문구를 정확히 입력해야 서버가 실행한다.
export function DeleteAllForm({ action, phrase }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; phrase: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="delete-confirm" className="text-sm">
        확인을 위해 <strong>{phrase}</strong> 를 입력하세요.
      </label>
      <Input id="delete-confirm" name="confirm" autoComplete="off" className="max-w-sm" />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="danger" size="md">
          전체 삭제
        </SubmitButton>
        {state ? (
          <span role={state.ok ? "status" : "alert"} className={cn("text-sm", state.ok ? "text-positive" : "text-danger")}>
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
