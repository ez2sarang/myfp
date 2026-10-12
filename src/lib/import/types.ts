// 사진 인식 결과 → 등록 후보 (순수 모듈의 공통 타입). 분류는 "제안"일 뿐이고 사용자가 확인 화면에서 확정한다.
import type { AssetCategory, ExpenseCategory } from "../finance/types.ts";

export type Point = [number, number];

/** 워커가 내는 인식 줄 하나 (box: 시계 방향 네 꼭짓점, 왼쪽 위부터). score 는 신뢰도 판정에 쓰지 않는다 */
export interface OcrLineInput {
  text: string;
  score: number;
  box: Point[];
}

export type Layout = "card" | "receipt" | "bill" | "handwriting";

export interface CaptureContext {
  width: number;
  height: number;
  /** 화면 캡처(screenshot) / 카메라 사진(photo) — 사진이면 신뢰도 '확인 필요' */
  source: "screenshot" | "photo";
  /** 캡처일(YYYY-MM-DD). 연도 없는 날짜의 연도 추정 기준이다(시계에 의존하지 않도록 인자로 받는다) */
  today: string;
  /** 지정하지 않으면 detectLayout 으로 고른다 */
  layout?: Layout;
  /** 카드 목록: 화면 위로 스크롤돼 사라진 날짜 헤더를 직전 캡처에서 이어받을 때 그 날짜 */
  inheritedDate?: string | null;
}

export type Confidence = "high" | "check" | "low";

/** 신뢰도 사유 (확인 화면의 노랑 강조 근거) */
export type Reason =
  | "corrected" // 금액 오인식 보정 적용
  | "date-inherited" // 위쪽 헤더·직전 캡처·월 맥락에서 이어받은 날짜
  | "no-date"
  | "photo"
  | "sum-mismatch" // 품목 합 ≠ 합계
  | "duplicate"
  | "no-amount"
  | "format" // 금액 형식 위반
  | "day-range" // 일 > 그 달 말일
  | "handwriting";

export type Suggestion =
  | { kind: "fixed"; category: ExpenseCategory }
  | { kind: "planned" }
  | { kind: "asset"; category: AssetCategory }
  | { kind: "liability"; category: "card" | "loan" }
  /** 취소: 원거래와 상계하고 단독으로 등록하지 않는다 */
  | { kind: "offset"; offsetOf: number | null }
  | { kind: "none"; why: "short-term-card-loan" | "bill-item" };

export interface ImportCandidate {
  /** 결과 배열 안의 위치 (duplicateOf·offsetOf 가 가리키는 값) */
  index: number;
  /** 몇 번째 캡처에서 나왔는지 */
  capture: number;
  layout: Layout;
  /** 고지서·영수증의 합계 줄은 total, 그 밖은 item */
  role: "item" | "total";
  name: string;
  /** 원 단위 양의 정수. 취소면 cancelled 로 표시하고 값은 절댓값 */
  amount: number | null;
  date: string | null;
  time: string | null;
  dateSource: "direct" | "header" | "inherited" | "context" | null;
  /** 할부: N/M회(현재 회차·총 회차). "할부" 문구만 있으면 둘 다 null */
  installment: { current: number | null; total: number | null } | null;
  cancelled: boolean;
  corrected: boolean;
  reasons: Reason[];
  confidence: Confidence;
  suggestion: Suggestion;
  duplicateOf: number | null;
  /** 출처 줄 index(입력 배열 기준)와 금액 상자 */
  lines: number[];
  box: Point[] | null;
}
