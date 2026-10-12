"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

// 공유 링크 만들기. 만든 직후 서버가 돌려준 주소를 한 번만 보여 준다(서버는 해시만 보관하므로 다시 보여 줄 수 없다).
export function ShareCreateForm({ action, disabled }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; disabled: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const e = state?.errors ?? {};

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {state?.ok && state.shareUrl ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-brand bg-info-bg p-4 text-info-ink">
          <p className="text-sm font-semibold">{state.message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={state.shareUrl} aria-label="공유 링크 주소" className="flex-1 font-mono text-sm" onFocus={(ev) => ev.currentTarget.select()} />
            <Button variant="primary" size="md" onClick={() => copy(state.shareUrl as string)}>
              {copied ? "복사됨" : "복사"}
            </Button>
          </div>
          <p className="text-xs">이 창을 닫으면 주소를 다시 볼 수 없습니다. 잃어버리면 폐기하고 새로 만드세요.</p>
        </div>
      ) : null}

      <form action={formAction} className="grid gap-4 sm:grid-cols-2" onSubmit={() => setCopied(false)}>
        <Field id="share-label" label="이름 (나만 보임)" error={e.label} hint="예: 가족 공유용">
          <Input id="share-label" name="label" maxLength={60} placeholder="공유 링크" />
        </Field>
        <Field id="share-expires" label="만료" error={e.expires}>
          <Select id="share-expires" name="expires" defaultValue="30" className="w-full">
            <option value="7">7일</option>
            <option value="30">30일</option>
            <option value="90">90일</option>
            <option value="never">무기한</option>
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">포함할 항목</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="scope_summary" defaultChecked className="size-4" /> 대시보드 요약
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="scope_fixed" defaultChecked className="size-4" /> 고정지출 목록
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="scope_balances" className="size-4" /> 자산·부채
          </label>
          {e.scopes ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {e.scopes}
            </p>
          ) : null}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">가리기</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="mask_amounts" className="size-4" /> 금액 숨기기
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="mask_details" defaultChecked className="size-4" /> 메모·기관명 숨기기
          </label>
          <p className="text-xs text-muted">숨긴 값은 서버에서 지운 뒤 보내므로 받는 사람이 볼 방법이 없습니다.</p>
          <p className="text-xs text-muted">
            메모·기관명 숨기기는 「메모」와 「기관·카드명」 칸만 가립니다. 항목 이름에 적은 기관명은 그대로 보이니 필요하면 이름을 바꿔 주세요.
          </p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SubmitButton variant="primary" size="md">
            링크 만들기
          </SubmitButton>
          {disabled ? <span className="text-sm text-muted">사용 중인 링크가 상한에 도달했습니다.</span> : null}
          {state && !state.ok ? (
            <span role="alert" className={cn("text-sm text-danger")}>
              {state.message}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
