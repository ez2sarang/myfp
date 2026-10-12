"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions/state";
import { DISPLAY_NAME_MAX } from "@/lib/account/display-name";
import { cn } from "@/lib/utils";

// 표시 이름 저장·지우기. 서버가 다시 검증하며(앞뒤 공백 제거, 1~30자, 줄바꿈·제어 문자 거부) 대상은 항상 로그인한 본인이다.
export function DisplayNameForm({ action, current }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; current: string | null }) {
  const [state, formAction] = useActionState(action, null);
  const value = state && !state.ok ? (state.values?.displayName ?? current ?? "") : (current ?? "");
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="display-name" className="text-sm font-semibold">
        표시 이름
      </label>
      <p id="display-name-required" className="text-xs text-muted">
        로그인 공급자가 이름을 주지 않았다면 필수입니다. 지우면 다음 화면으로 이동할 때 이름을 다시 묻습니다.
      </p>
      <Input
        key={`${current ?? ""}|${state?.message ?? ""}`}
        id="display-name"
        name="displayName"
        defaultValue={value}
        maxLength={DISPLAY_NAME_MAX * 2}
        autoComplete="nickname"
        aria-describedby="display-name-required display-name-hint"
        className="max-w-sm"
      />
      <p id="display-name-hint" className="text-xs text-muted">
        {DISPLAY_NAME_MAX}자 이하. 본인과 운영자(관리자)만 보며, 공유 링크를 받은 사람에게는 보이지 않습니다.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="primary" size="sm" name="intent" value="save">
          저장
        </SubmitButton>
        {current ? (
          <SubmitButton variant="ghost" size="sm" name="intent" value="clear">
            지우기
          </SubmitButton>
        ) : null}
        {state ? (
          <span role={state.ok ? "status" : "alert"} className={cn("text-xs", state.ok ? "text-positive" : "text-danger")}>
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
