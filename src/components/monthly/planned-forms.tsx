"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, describedBy } from "@/components/shared/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { clearOverrideAction, createPlannedAction, deletePlannedAction, setOverrideAction, setPlannedStatusAction, updatePlannedAction } from "@/lib/actions/monthly";
import type { ActionState } from "@/lib/actions/state";
import { MAX_INSTALLMENTS } from "@/lib/finance/monthly-validate";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/finance/types";
import type { PlannedStatus } from "@/lib/finance/occurrences";
import { cn } from "@/lib/utils";

// 예정지출 탭의 폼들 (클라이언트). 서버 액션이 다시 검증하고, 대상은 언제나 로그인한 본인의 항목이다.

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <span role={state.ok ? "status" : "alert"} className={cn("text-xs", state.ok ? "text-positive" : "text-danger")}>
      {state.message}
    </span>
  );
}

function CategorySelect({ id, defaultValue, error }: { id: string; defaultValue: string; error?: string }) {
  return (
    <Select id={id} name="category" defaultValue={defaultValue} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error)}>
      {EXPENSE_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {EXPENSE_CATEGORY_LABELS[c]}
        </option>
      ))}
    </Select>
  );
}

/** 예정·일회성 지출 추가 (N개월 분할 가능) */
export function PlannedAddForm({ today }: { today: string }) {
  const [state, action] = useActionState(createPlannedAction, null);
  const v = state && !state.ok ? (state.values ?? {}) : {};
  const e = state?.errors ?? {};
  return (
    <form action={action} key={state?.ok ? state.message : "form"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_0.8fr_auto] lg:items-end">
      <Field id="planned-name" label="이름" error={e.name}>
        <Input id="planned-name" name="name" defaultValue={v.name ?? ""} maxLength={60} aria-invalid={e.name ? true : undefined} aria-describedby={describedBy("planned-name", e.name)} />
      </Field>
      <Field id="planned-category" label="분류" error={e.category}>
        <CategorySelect id="planned-category" defaultValue={v.category ?? "other"} error={e.category} />
      </Field>
      <Field id="planned-amount" label="금액(원)" error={e.amount}>
        <Input id="planned-amount" name="amount" inputMode="numeric" defaultValue={v.amount ?? ""} aria-invalid={e.amount ? true : undefined} aria-describedby={describedBy("planned-amount", e.amount)} />
      </Field>
      <Field id="planned-date" label="날짜(첫 회)" error={e.dueDate}>
        <Input id="planned-date" name="dueDate" type="date" defaultValue={v.dueDate ?? today} aria-invalid={e.dueDate ? true : undefined} aria-describedby={describedBy("planned-date", e.dueDate)} />
      </Field>
      <Field id="planned-count" label="분할(개월)" hint={`1~${MAX_INSTALLMENTS}`} error={e.count}>
        <Input id="planned-count" name="count" inputMode="numeric" defaultValue={v.count ?? "1"} aria-invalid={e.count ? true : undefined} aria-describedby={describedBy("planned-count", e.count, `1~${MAX_INSTALLMENTS}`)} />
      </Field>
      <div className="flex flex-col gap-1">
        <SubmitButton variant="primary" size="md">
          추가
        </SubmitButton>
        <Message state={state} />
      </div>
    </form>
  );
}

/** 고정지출 발생의 이 달만 변경: 금액 바꾸기·건너뛰기·되돌리기 */
export function OverrideControls({ fixedId, month, amount, overridden, skipped }: { fixedId: string; month: string; amount: number; overridden: boolean; skipped: boolean }) {
  const [state, action] = useActionState(setOverrideAction, null);
  const [clearState, clear] = useActionState(clearOverrideAction, null);
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="fixedId" value={fixedId} />
        <input type="hidden" name="month" value={month} />
        <label className="flex flex-col gap-1 text-xs font-semibold">
          이 달 금액(원)
          <Input name="amount" inputMode="numeric" defaultValue={String(amount)} className="w-36" />
        </label>
        <SubmitButton name="mode" value="amount" size="sm">
          이 달만 변경
        </SubmitButton>
        {skipped ? null : (
          <SubmitButton name="mode" value="skip" size="sm" variant="ghost">
            이 달 건너뛰기
          </SubmitButton>
        )}
        <Message state={state} />
      </form>
      {overridden ? (
        <form action={clear} className="flex items-center gap-2">
          <input type="hidden" name="fixedId" value={fixedId} />
          <input type="hidden" name="month" value={month} />
          <SubmitButton size="sm" variant="ghost">
            {skipped ? "건너뛰기 취소" : "원래 금액으로"}
          </SubmitButton>
          <Message state={clearState} />
        </form>
      ) : null}
    </div>
  );
}

/** 예정지출 한 건: 수정(묶음이면 묶음 전체 선택 가능)·상태·삭제 */
export function PlannedControls({
  item,
}: {
  item: { id: string; name: string; category: ExpenseCategory; amount: number; dueDate: string; status: PlannedStatus; groupId: string | null; total: number | null };
}) {
  const [state, update] = useActionState(updatePlannedAction, null);
  const [statusState, setStatus] = useActionState(setPlannedStatusAction, null);
  const [deleteState, remove] = useActionState(deletePlannedAction, null);
  const p = `planned-${item.id}`;
  return (
    <div className="flex flex-col gap-3">
      <form action={update} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:items-end">
        <input type="hidden" name="id" value={item.id} />
        <Field id={`${p}-name`} label="이름">
          <Input id={`${p}-name`} name="name" defaultValue={item.name} maxLength={60} />
        </Field>
        <Field id={`${p}-category`} label="분류">
          <CategorySelect id={`${p}-category`} defaultValue={item.category} />
        </Field>
        <Field id={`${p}-amount`} label="금액(원)">
          <Input id={`${p}-amount`} name="amount" inputMode="numeric" defaultValue={String(item.amount)} />
        </Field>
        <Field id={`${p}-date`} label="날짜">
          <Input id={`${p}-date`} name="dueDate" type="date" defaultValue={item.dueDate} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <SubmitButton name="scope" value="one" size="sm" variant="primary">
            이 회차 저장
          </SubmitButton>
          {item.groupId ? (
            <SubmitButton name="scope" value="group" size="sm">
              {`묶음 ${item.total}회 모두 (이름·분류·금액)`}
            </SubmitButton>
          ) : null}
          <Message state={state} />
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <form action={setStatus} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          {item.status !== "paid" ? (
            <SubmitButton name="status" value="paid" size="sm">
              납부 처리
            </SubmitButton>
          ) : null}
          {item.status !== "planned" ? (
            <SubmitButton name="status" value="planned" size="sm" variant="ghost">
              예정으로 되돌리기
            </SubmitButton>
          ) : null}
          {item.status !== "skipped" ? (
            <SubmitButton name="status" value="skipped" size="sm" variant="ghost">
              건너뛰기
            </SubmitButton>
          ) : null}
          <Message state={statusState} />
        </form>
        <form
          action={remove}
          className="flex items-center gap-2"
          onSubmit={(event) => {
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const text = submitter?.value === "group" ? `묶음 ${item.total}회를 모두 삭제할까요?` : "이 항목을 삭제할까요?";
            if (!window.confirm(text)) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton name="scope" value="one" size="sm" variant="danger">
            삭제
          </SubmitButton>
          {item.groupId ? (
            <SubmitButton name="scope" value="group" size="sm" variant="danger">
              묶음 전체 삭제
            </SubmitButton>
          ) : null}
          <Message state={deleteState} />
        </form>
      </div>
    </div>
  );
}
