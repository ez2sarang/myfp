"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, describedBy } from "@/components/shared/field";
import { Input } from "@/components/ui/input";
import { DISPLAY_NAME_MAX } from "@/lib/account/display-name";
import type { ActionState } from "@/lib/actions/state";

// 이름 입력(처음 이용 전 한 번). 저장은 설정 화면과 같은 이름 저장 액션이 다시 검증하고(1~30자, 보이지 않는 문자 거부), 대상은 로그인한 본인뿐이다.
// 저장되면 서버가 정규화한 내부 경로(next)로 이동한다. 오류 문장에는 입력값을 넣지 않는다.
export function WelcomeNameForm({ action, next }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; next: string }) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.replace(next);
  }, [state, next, router]);
  const error = state && !state.ok ? state.message : undefined;
  const hint = `1~${DISPLAY_NAME_MAX}자. 별명도 괜찮아요.`;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="welcome-name" label="이름" hint={hint} error={error}>
        <Input
          id="welcome-name"
          name="displayName"
          required
          autoFocus
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX * 2}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("welcome-name", error, hint)}
        />
      </Field>
      <SubmitButton variant="primary" size="md" className="w-full sm:w-auto">
        저장하고 시작하기
      </SubmitButton>
      {state?.ok ? (
        <p role="status" className="text-sm text-positive">
          저장했습니다. 이동하는 중…
        </p>
      ) : null}
    </form>
  );
}
