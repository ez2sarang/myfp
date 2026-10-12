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
export function ShareCreateForm({
  action,
  disabled,
  thisMonth,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  disabled: boolean;
  /** 기간 입력의 기본값 (YYYY-MM, 서울) */
  thisMonth: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const [period, setPeriod] = useState<"current" | "month" | "range">("current");
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
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-info-bg p-4 text-info-ink sm:p-5">
          <p className="text-sm font-semibold">{state.message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={state.shareUrl} aria-label="공유 링크 주소" className="min-w-0 flex-1 bg-surface font-mono text-sm" onFocus={(ev) => ev.currentTarget.select()} />
            <Button variant="primary" size="md" onClick={() => copy(state.shareUrl as string)}>
              {copied ? "복사됨" : "복사"}
            </Button>
          </div>
          <p className="text-xs">이 창을 닫으면 주소를 다시 볼 수 없습니다. 잃어버리면 폐기하고 새로 만드세요.</p>
        </div>
      ) : null}

      <form action={formAction} className="grid gap-x-5 gap-y-4 sm:grid-cols-2" onSubmit={() => setCopied(false)}>
        <Field id="share-label" label="이름 (나만 보임)" error={e.label} hint="예: 가족 공유용">
          <Input id="share-label" name="label" maxLength={60} placeholder="공유 링크" />
        </Field>
        <Field id="share-expires" label="링크 만료" error={e.expires}>
          <Select id="share-expires" name="expires" defaultValue="30" className="w-full">
            <option value="7">7일</option>
            <option value="30">30일</option>
            <option value="90">90일</option>
            <option value="never">무기한</option>
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 px-4 pb-4 pt-2 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold">보여 줄 달 (만든 뒤에는 바꿀 수 없습니다)</legend>
          <div role="radiogroup" aria-label="보여 줄 달" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(
              [
                ["current", "항상 그때의 이번 달(매달 바뀜)"],
                ["month", "특정 달 1개"],
                ["range", "여러 달(최대 12개월)"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2 sm:min-h-9">
                <input type="radio" name="period_mode" value={value} checked={period === value} onChange={() => setPeriod(value)} className="size-4 accent-[var(--brand)]" />
                {label}
              </label>
            ))}
          </div>
          {period === "month" ? (
            <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
              공유할 달
              <Input type="month" name="period_month" defaultValue={thisMonth} required />
            </label>
          ) : null}
          {period === "range" ? (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                시작 달
                <Input type="month" name="period_start" defaultValue={thisMonth} required />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                끝 달
                <Input type="month" name="period_end" defaultValue={thisMonth} required />
              </label>
            </div>
          ) : null}
          <p className="text-xs text-muted">요약·고정지출 목록에는 이 기간의 달만 들어갑니다. 자산·부채는 열람 시점의 현재 값입니다.</p>
          <p className="text-xs text-muted">요약 공유 링크에는 이번 달(또는 선택한 기간)의 예정·일회성 지출이 함께 보입니다. 이미 만든 링크에도 추가·변경이 바로 반영됩니다.</p>
          {e.period ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {e.period}
            </p>
          ) : null}
        </fieldset>
        <fieldset className="flex flex-col gap-1 rounded-lg border border-line bg-surface-2 px-4 pb-4 pt-2">
          <legend className="px-1 text-sm font-semibold">포함할 항목</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:min-h-9">
            <input type="checkbox" name="scope_summary" defaultChecked className="size-4 shrink-0 accent-[var(--brand)]" /> 대시보드 요약(세부 항목 포함)
          </label>
          <p className="ml-6 text-xs text-muted">
            요약에는 효력 있는 모든 고정지출의 세부 목록(이름·분류·납부일·결제수단·종료일, 금액 표시 링크면 금액)이 함께 보입니다.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:min-h-9">
            <input type="checkbox" name="scope_fixed" defaultChecked className="size-4 shrink-0 accent-[var(--brand)]" /> 고정지출 목록
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:min-h-9">
            <input type="checkbox" name="scope_balances" className="size-4 shrink-0 accent-[var(--brand)]" /> 자산·부채
          </label>
          {e.scopes ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {e.scopes}
            </p>
          ) : null}
        </fieldset>
        <fieldset className="flex flex-col gap-1 rounded-lg border border-line bg-surface-2 px-4 pb-4 pt-2">
          <legend className="px-1 text-sm font-semibold">가리기</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:min-h-9">
            <input type="checkbox" name="mask_amounts" className="size-4 shrink-0 accent-[var(--brand)]" /> 금액 숨기기
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:min-h-9">
            <input type="checkbox" name="mask_details" defaultChecked className="size-4 shrink-0 accent-[var(--brand)]" /> 메모·기관명 숨기기
          </label>
          <p className="text-xs text-muted">
            기본은 금액이 보입니다. 금액 숨기기를 켜면 금액·합계·비중과 차트가 빠지지만 항목 구성(이름·분류·납부일)은 보입니다. 숨긴 값은 서버에서 지운 뒤 보냅니다.
          </p>
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
