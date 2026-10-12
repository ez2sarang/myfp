"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, describedBy } from "@/components/shared/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/actions/state";
import {
  CYCLES,
  CYCLE_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_SOURCES,
  EXPENSE_SOURCE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type FixedExpense,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

function initialValues(item: FixedExpense | null): Record<string, string> {
  if (!item) return { cycle: "monthly", category: "other", source: "manual", active: "on" };
  return {
    name: item.name,
    category: item.category,
    amount: String(item.amount),
    cycle: item.cycle,
    billing_day: item.billingDay === null ? "" : String(item.billingDay),
    billing_month: item.billingMonth === null ? "" : String(item.billingMonth),
    payment_method: item.paymentMethod ?? "",
    institution: item.institution ?? "",
    start_date: item.startDate ?? "",
    end_date: item.endDate ?? "",
    note: item.note ?? "",
    source: item.source,
    active: item.active ? "on" : "",
    private: item.private ? "on" : "",
  };
}

// 고정지출 추가·수정 폼. 검증은 서버가 하고(같은 규칙), 오류가 나면 입력값을 그대로 다시 채운다.
// 남은 횟수는 입력 편의용이다: 서버가 다음 납부일부터 N 회를 종료일로 바꿔 저장한다.
export function FixedForm({
  action,
  item,
  submitLabel,
  sharedWithGroup = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  item: FixedExpense | null;
  submitLabel: string;
  /** 함께 보기 그룹에 고정지출을 내놓은 상태면 안내 한 줄 */
  sharedWithGroup?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const v = state?.values ?? initialValues(item);
  const e = state?.errors ?? {};
  const prefix = item ? `fx-${item.id.slice(0, 8)}` : "fx-new";
  const id = (name: string) => `${prefix}-${name}`;
  // 성공 후에는 빈 폼으로, 실패 후에는 제출한 값으로 다시 그린다.
  const formKey = state ? `${state.ok}-${state.message}-${JSON.stringify(state.values ?? {}).length}` : "init";

  return (
    <form key={formKey} action={formAction} className="grid gap-4 sm:grid-cols-2" noValidate>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <Field id={id("name")} label="이름" error={e.name} className="sm:col-span-2">
        <Input id={id("name")} name="name" defaultValue={v.name} required maxLength={100} aria-invalid={!!e.name} aria-describedby={describedBy(id("name"), e.name)} />
      </Field>
      <Field id={id("category")} label="분류" error={e.category}>
        <Select id={id("category")} name="category" defaultValue={v.category} className="w-full">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {EXPENSE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("amount")} label="금액 (원)" hint="쉼표 없이 또는 쉼표를 넣어 입력" error={e.amount}>
        <Input
          id={id("amount")}
          name="amount"
          inputMode="numeric"
          defaultValue={v.amount}
          required
          maxLength={20}
          aria-invalid={!!e.amount}
          aria-describedby={describedBy(id("amount"), e.amount, "hint")}
        />
      </Field>
      <Field id={id("cycle")} label="주기" error={e.cycle}>
        <Select id={id("cycle")} name="cycle" defaultValue={v.cycle} className="w-full">
          {CYCLES.map((c) => (
            <option key={c} value={c}>
              {CYCLE_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={id("billing_day")} label="납부일" hint="1–31, 31은 말일" error={e.billing_day}>
          <Input id={id("billing_day")} name="billing_day" inputMode="numeric" defaultValue={v.billing_day} maxLength={2} aria-invalid={!!e.billing_day} aria-describedby={describedBy(id("billing_day"), e.billing_day, "hint")} />
        </Field>
        <Field id={id("billing_month")} label="납부 월" hint="매년일 때만" error={e.billing_month}>
          <Input id={id("billing_month")} name="billing_month" inputMode="numeric" defaultValue={v.billing_month} maxLength={2} aria-invalid={!!e.billing_month} aria-describedby={describedBy(id("billing_month"), e.billing_month, "hint")} />
        </Field>
      </div>
      <Field id={id("payment_method")} label="결제수단" error={e.payment_method}>
        <Select id={id("payment_method")} name="payment_method" defaultValue={v.payment_method ?? ""} className="w-full">
          <option value="">선택 안 함</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("institution")} label="기관·카드명" error={e.institution}>
        <Input id={id("institution")} name="institution" defaultValue={v.institution} maxLength={100} aria-invalid={!!e.institution} />
      </Field>
      <Field id={id("start_date")} label="시작일" error={e.start_date}>
        <Input id={id("start_date")} name="start_date" type="date" defaultValue={v.start_date} aria-invalid={!!e.start_date} />
      </Field>
      <Field id={id("end_date")} label="종료일" hint="비우면 무기한" error={e.end_date}>
        <Input id={id("end_date")} name="end_date" type="date" defaultValue={v.end_date} aria-invalid={!!e.end_date} aria-describedby={describedBy(id("end_date"), e.end_date, "hint")} />
      </Field>
      <Field id={id("remaining_count")} label="남은 횟수 (선택)" hint="입력하면 다음 납부일부터 계산해 종료일로 저장합니다" error={e.remaining_count}>
        <Input id={id("remaining_count")} name="remaining_count" inputMode="numeric" defaultValue={v.remaining_count} maxLength={3} aria-invalid={!!e.remaining_count} aria-describedby={describedBy(id("remaining_count"), e.remaining_count, "hint")} />
      </Field>
      <Field id={id("source")} label="출처" error={e.source}>
        <Select id={id("source")} name="source" defaultValue={v.source} className="w-full">
          {EXPENSE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {EXPENSE_SOURCE_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("note")} label="메모" error={e.note} className="sm:col-span-2">
        <textarea
          id={id("note")}
          name="note"
          defaultValue={v.note}
          maxLength={500}
          rows={2}
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-ink"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={v.active === "on"} className="size-4" />
        활성 (합계와 일정에 포함)
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
        <input type="checkbox" name="private" defaultChecked={v.private === "on"} className="size-4" />
        나만 보기 (함께 보기 그룹 합산에서 뺀다)
      </label>
      {sharedWithGroup ? <p className="-mt-2 text-xs text-muted sm:col-span-2">그룹에 보임 — 숨기려면 「나만 보기」를 체크하세요.</p> : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton variant="primary" size="md">
          {submitLabel}
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
