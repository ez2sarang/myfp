// CSV 내보내기 내용 (순수 모듈). 열 이름은 한국어, 값은 저장된 그대로(금액은 원 단위 정수).
import { toCsv } from "./csv.ts";
import {
  CYCLE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  BALANCE_KIND_LABELS,
  balanceCategoryLabel,
  type BalanceItem,
  type FixedExpense,
} from "./types.ts";

export function fixedCsv(items: readonly FixedExpense[]): string {
  return toCsv(
    ["이름", "분류", "금액", "주기", "납부일", "납부월", "결제수단", "기관·카드", "시작일", "종료일", "활성", "보관", "출처", "메모"],
    items.map((f) => [
      f.name,
      EXPENSE_CATEGORY_LABELS[f.category],
      f.amount,
      CYCLE_LABELS[f.cycle],
      f.billingDay,
      f.billingMonth,
      f.paymentMethod ? PAYMENT_METHOD_LABELS[f.paymentMethod] : null,
      f.institution,
      f.startDate,
      f.endDate,
      f.active ? "Y" : "N",
      f.archived ? "Y" : "N",
      EXPENSE_SOURCE_LABELS[f.source],
      f.note,
    ]),
  );
}

export function balanceCsv(items: readonly BalanceItem[]): string {
  return toCsv(
    ["구분", "분류", "이름", "금액", "기준일", "월 상환액", "금리(%)", "종료일", "메모"],
    items.map((b) => [
      BALANCE_KIND_LABELS[b.kind],
      balanceCategoryLabel(b.kind, b.category),
      b.name,
      b.amount,
      b.asOf,
      b.monthlyPayment,
      b.interestRate,
      b.endDate,
      b.note,
    ]),
  );
}
