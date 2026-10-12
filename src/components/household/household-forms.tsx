"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptInviteAction, createHouseholdAction, createInviteAction, updateMembershipAction } from "@/lib/actions/household";
import type { ActionState } from "@/lib/actions/state";
import { HOUSEHOLD_NAME_MAX, TAG_MAX } from "@/lib/household/rules";
import { cn } from "@/lib/utils";

// 함께 보기 폼 (클라이언트). 서버 액션이 다시 검증하고, 대상은 언제나 로그인한 본인과 본인이 속한 그룹이다.

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <span role={state.ok ? "status" : "alert"} className={cn("text-sm", state.ok ? "text-positive" : "text-danger")}>
      {state.message}
    </span>
  );
}

function ScopeChecks({ fixed, balances }: { fixed: boolean; balances: boolean }) {
  return (
    <fieldset className="flex flex-col gap-1 rounded-lg border border-line bg-surface-2 px-4 pb-3 pt-2 text-sm">
      <legend className="px-1 font-semibold">그룹에 내놓을 것</legend>
      <label className="flex min-h-11 items-center gap-2 sm:min-h-9">
        <input type="checkbox" name="share_fixed" defaultChecked={fixed} className="size-4 accent-[var(--brand)]" /> 고정지출 (이름·분류·금액·납부일·기간)
      </label>
      <label className="flex min-h-11 items-center gap-2 sm:min-h-9">
        <input type="checkbox" name="share_balances" defaultChecked={balances} className="size-4 accent-[var(--brand)]" /> 자산·부채 (이름·분류·금액)
      </label>
      <p className="text-xs text-muted">메모·기관/카드명·결제수단과 「나만 보기」로 표시한 항목은 어떤 경우에도 보이지 않습니다.</p>
    </fieldset>
  );
}

export function CreateHouseholdForm() {
  const [state, action] = useActionState(createHouseholdAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        그룹 이름
        <Input name="name" maxLength={HOUSEHOLD_NAME_MAX * 2} placeholder="예: 우리 집" required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        내 태그
        <Input name="tag" maxLength={TAG_MAX * 2} placeholder="예: 나" required />
      </label>
      <SubmitButton variant="primary" size="md">
        그룹 만들기
      </SubmitButton>
      <div className="sm:col-span-3">
        <Message state={state} />
      </div>
    </form>
  );
}

/** 초대 링크 만들기: 만든 직후 서버가 돌려준 주소를 한 번만 보여 준다 */
export function InviteCreator({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(createInviteAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {state?.ok && state.shareUrl ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-brand/40 bg-info-bg p-4 text-info-ink">
          <p className="text-sm font-semibold">{state.message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={state.shareUrl} aria-label="초대 링크 주소" className="min-w-0 flex-1 bg-surface font-mono text-sm" onFocus={(ev) => ev.currentTarget.select()} />
            <Button
              variant="primary"
              size="md"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.shareUrl as string);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "복사됨" : "복사"}
            </Button>
          </div>
          <p className="text-xs">초대받은 사람이 로그인한 뒤 동의해야 그룹에 들어옵니다. 이 주소는 다시 볼 수 없습니다.</p>
        </div>
      ) : null}
      <form action={action} onSubmit={() => setCopied(false)} className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="primary" size="md">
          초대 링크 만들기
        </SubmitButton>
        {disabled ? <span className="text-sm text-muted">그룹이 꽉 찼거나 사용 중인 초대가 최대입니다.</span> : null}
        {state && !state.ok ? <Message state={state} /> : null}
      </form>
    </div>
  );
}

export function MembershipForm({ tag, fixed, balances }: { tag: string; fixed: boolean; balances: boolean }) {
  const [state, action] = useActionState(updateMembershipAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
        내 태그 (그룹 안에서 보이는 이름)
        <Input name="tag" defaultValue={tag} maxLength={TAG_MAX * 2} required />
      </label>
      <ScopeChecks fixed={fixed} balances={balances} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="primary" size="md">
          저장
        </SubmitButton>
        <Message state={state} />
      </div>
    </form>
  );
}

/** 초대 수락: 동의 체크·내 태그·내놓을 범위 */
export function AcceptInviteForm({ token, householdName }: { token: string; householdName: string }) {
  const [state, action] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
        내 태그 (그룹 안에서 보이는 이름)
        <Input name="tag" maxLength={TAG_MAX * 2} placeholder="예: 엄마" required />
      </label>
      <ScopeChecks fixed balances={false} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 size-4 accent-[var(--brand)]" />
        <span>
          「{householdName}」 그룹의 구성원이 내가 위에서 고른 항목(「나만 보기」 제외)을 볼 수 있다는 데 동의합니다. 언제든 그룹에서 나가거나 범위를 바꾸면 즉시 보이지 않게 됩니다.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="primary" size="md">
          동의하고 들어가기
        </SubmitButton>
        <Message state={state} />
      </div>
    </form>
  );
}
