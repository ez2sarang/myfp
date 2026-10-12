"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, describedBy } from "@/components/shared/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/actions/state";
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  BALANCE_KINDS,
  BALANCE_KIND_LABELS,
  LIABILITY_CATEGORIES,
  LIABILITY_CATEGORY_LABELS,
  type BalanceItem,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

function initialValues(item: BalanceItem | null, kind: "asset" | "liability"): Record<string, string> {
  if (!item) return { kind, category: kind === "asset" ? "deposit" : "loan" };
  return {
    kind: item.kind,
    category: item.category,
    name: item.name,
    amount: String(item.amount),
    as_of: item.asOf ?? "",
    note: item.note ?? "",
    monthly_payment: item.monthlyPayment === null ? "" : String(item.monthlyPayment),
    interest_rate: item.interestRate === null ? "" : String(item.interestRate),
    end_date: item.endDate ?? "",
  };
}

// 자산·부채 추가·수정 폼. 부채일 때만 월 상환액·금리·종료일을 받는다(서버도 자산이면 이 값을 버린다).
export function BalanceForm({
  action,
  item,
  submitLabel,
  defaultKind = "asset",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  item: BalanceItem | null;
  submitLabel: string;
  defaultKind?: "asset" | "liability";
}) {
  const [state, formAction] = useActionState(action, null);
  const v = state?.values ?? initialValues(item, defaultKind);
  const e = state?.errors ?? {};
  const [kind, setKind] = useState<string>(v.kind ?? defaultKind);
  const prefix = item ? `bl-${item.id.slice(0, 8)}` : `bl-new-${defaultKind}`;
  const id = (name: string) => `${prefix}-${name}`;
  const categories = kind === "liability" ? LIABILITY_CATEGORIES : ASSET_CATEGORIES;
  const labels: Record<string, string> = kind === "liability" ? LIABILITY_CATEGORY_LABELS : ASSET_CATEGORY_LABELS;
  const formKey = state ? `${state.ok}-${state.message}-${JSON.stringify(state.values ?? {}).length}` : "init";

  return (
    <form key={formKey} action={formAction} className="grid gap-4 sm:grid-cols-2" noValidate>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <Field id={id("kind")} label="구분" error={e.kind}>
        <Select id={id("kind")} name="kind" value={kind} onChange={(ev) => setKind(ev.target.value)} className="w-full">
          {BALANCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {BALANCE_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("category")} label="분류" error={e.category}>
        <Select key={kind} id={id("category")} name="category" defaultValue={categories.includes(v.category as never) ? v.category : categories[0]} className="w-full">
          {categories.map((c) => (
            <option key={c} value={c}>
              {labels[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("name")} label="이름" error={e.name}>
        <Input id={id("name")} name="name" defaultValue={v.name} required maxLength={100} aria-invalid={!!e.name} aria-describedby={describedBy(id("name"), e.name)} />
      </Field>
      <Field id={id("amount")} label={kind === "liability" ? "남은 잔액 (원)" : "금액 (원)"} error={e.amount}>
        <Input id={id("amount")} name="amount" inputMode="numeric" defaultValue={v.amount} required maxLength={20} aria-invalid={!!e.amount} aria-describedby={describedBy(id("amount"), e.amount)} />
      </Field>
      <Field id={id("as_of")} label="기준일" error={e.as_of}>
        <Input id={id("as_of")} name="as_of" type="date" defaultValue={v.as_of} aria-invalid={!!e.as_of} />
      </Field>
      {kind === "liability" ? (
        <>
          <Field id={id("monthly_payment")} label="월 상환액 (선택)" error={e.monthly_payment}>
            <Input id={id("monthly_payment")} name="monthly_payment" inputMode="numeric" defaultValue={v.monthly_payment} maxLength={20} aria-invalid={!!e.monthly_payment} />
          </Field>
          <Field id={id("interest_rate")} label="금리 % (선택)" error={e.interest_rate}>
            <Input id={id("interest_rate")} name="interest_rate" inputMode="decimal" defaultValue={v.interest_rate} maxLength={8} aria-invalid={!!e.interest_rate} />
          </Field>
          <Field id={id("end_date")} label="상환 종료일 (선택)" error={e.end_date}>
            <Input id={id("end_date")} name="end_date" type="date" defaultValue={v.end_date} aria-invalid={!!e.end_date} />
          </Field>
        </>
      ) : null}
      <Field id={id("note")} label="메모" error={e.note} className="sm:col-span-2">
        <textarea id={id("note")} name="note" defaultValue={v.note} maxLength={500} rows={2} className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-ink" />
      </Field>
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
