// 사진 인식 파서 시험용 합성 캡처 (가상 이름·가상 금액·합성 상자만). 시험 파일들이 함께 쓴다.
import type { CaptureContext, OcrLineInput, Point } from "../src/lib/import/types.ts";

export const TODAY = "2026-10-12";

export function line(text: string, x0: number, y0: number, x1: number, y1: number, angle = 0): OcrLineInput {
  const rot = ([x, y]: Point): Point => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  return { text, score: 0.9, box: ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Point[]).map(rot) };
}
// 카드 앱 한 행: 왼쪽 이름, 오른쪽 금액(높이 30), 그 아래 날짜 줄
export const row = (y: number, name: string, amount: string): OcrLineInput[] => [line(name, 30, y, 220, y + 30), line(amount, 400, y, 540, y + 30)];

export const SHOT: CaptureContext = { width: 576, height: 1280, source: "screenshot", today: TODAY };
export const PHOTO: CaptureContext = { width: 600, height: 1000, source: "photo", today: TODAY };

export const CARD_CAPTURE: OcrLineInput[] = [
  line("10월 3일", 30, 90, 150, 115),
  ...row(140, "가상커피 본점", "4,500원"),
  line("2026.10.03 08:15", 30, 175, 220, 195),
  ...row(250, "가상마트", "32,000원"),
  ...row(320, "가상통신", "55,000원"),
  line("2026.10.03 09:00", 30, 355, 220, 375),
  ...row(420, "가상가전", "120,000원"),
  line("2026.10.03 10:00", 30, 455, 220, 475),
  line("할부 3/6회", 420, 455, 540, 475),
  ...row(520, "가상커피 본점", "-4,500원"),
  line("2026.10.03 08:20 승인취소", 30, 555, 260, 575),
  ...row(620, "현금서비스", "300,000원"),
  line("2026.10.03 11:00", 30, 655, 220, 675),
  ...row(720, "가상서점", "1O,5o0원"),
  line("2026.10.03 12:00", 30, 755, 220, 775),
];

// 한 줄 품목(이름 + 오른쪽 금액) 영수증. header 면 품목 표 머리글(품명·금액)이 있다
export const RECEIPT_CAPTURE = (riceAmount = "1,000", { header = false } = {}): OcrLineInput[] => [
  line("가상식당", 200, 30, 400, 70),
  line("영수증", 250, 90, 350, 110),
  line("2026-10-05 12:30", 150, 130, 400, 150),
  ...(header ? [line("품명", 50, 170, 200, 190), line("금액", 450, 170, 550, 190)] : []),
  line("김치찌개", 50, 200, 200, 220),
  line("9,000", 450, 200, 550, 220),
  line("된장찌개", 50, 240, 200, 260),
  line("8,000", 450, 240, 550, 260),
  line("공기밥", 50, 280, 200, 300),
  line(riceAmount, 450, 280, 550, 300),
  line("합계", 50, 340, 200, 360),
  line("18,000", 450, 340, 550, 360),
  line("부가세", 50, 380, 200, 400),
  line("1,636", 450, 380, 550, 400),
  line("받을금액", 50, 420, 200, 440),
  line("18,000", 450, 420, 550, 440),
];

export const MART: CaptureContext = { ...PHOTO, height: 1400 };

/** 마트 영수증(구조만 본뜬 가상 값): 큰 상호, 숫자 섞인 주소·안내문, 일시, 품목 표 머리글, 두 줄 품목 4개(이름 줄 + 바코드·단가·수량·금액 줄),
 *  합계 낱말 줄(기본 총구매액·내실금액·신용액, 신용액은 「신용」「액:」 두 상자), 과세물품가액·부가세, 포인트 3줄(합계보다 큰 금액 포함), 아래쪽 매출금액 */
export function MART_RECEIPT({
  amounts = ["4,000", "7,000", "2,500", "3,000"],
  header = true,
  totals = [
    ["총구매액", "16,500"],
    ["내실금액", "16,500"],
    ["신용액", "16,500"],
  ],
  sales = true,
}: { amounts?: string[]; header?: boolean; totals?: [string, string][]; sales?: boolean } = {}): OcrLineInput[] {
  const items = [
    ["001 P가상그래놀라 350.0g", "4,000", "1"],
    ["002 가상우유 235g 235", "3,500", "2"],
    ["003 가상과자 100g", "2,500", "1"],
    ["004 가상두부 2입", "1,500", "2"],
  ];
  return [
    line("가상마트", 180, 20, 420, 80),
    line("가상시 가상구 가상로 233 (가상동)", 40, 100, 560, 120),
    line("교환·환불은 15일 이내 영수증 지참", 40, 130, 560, 150),
    line("2026-10-05 14:20 POS 01", 40, 170, 400, 190),
    ...(header ? [line("상품(코드)", 40, 220, 200, 240), line("단가", 290, 220, 360, 240), line("수량", 400, 220, 450, 240), line("금액", 500, 220, 560, 240)] : []),
    ...items.flatMap(([name, unit, qty], k) => {
      const y = 260 + 70 * k;
      return [
        line(name!, 40, y, 420, y + 20),
        line(`88000000000${k + 1}${k + 1}`, 40, y + 30, 200, y + 50),
        line(unit!, 290, y + 30, 360, y + 50),
        line(qty!, 420, y + 30, 440, y + 50),
        line(amounts[k]!, 490, y + 30, 560, y + 50),
      ];
    }),
    ...totals.flatMap(([name, value], k) => {
      const y = 560 + 30 * k;
      const label = name === "신용액" ? [line("신용", 40, y, 100, y + 20), line("액:", 105, y, 160, y + 20)] : [line(name, 40, y, 200, y + 20)];
      return [...label, line(value, 480, y, 560, y + 20)];
    }),
    line("과세물품가액", 40, 660, 250, 680),
    line("15,000", 480, 660, 560, 680),
    line("부가세", 40, 690, 200, 710),
    line("1,500", 480, 690, 560, 710),
    line("적립포인트", 40, 740, 250, 760),
    line("165", 480, 740, 560, 760),
    line("누적포인트", 40, 770, 250, 790),
    line("98,700", 480, 770, 560, 790),
    line("사용가능포인트 합계", 40, 800, 300, 820),
    line("98,700", 480, 800, 560, 820),
    ...(sales ? [line("[신용승인] 매출금액 16,500원", 40, 860, 560, 880)] : []),
  ];
}

export const BILL_CAPTURE = (angle = 0): OcrLineInput[] => [
  line("가상아파트 관리비 고지서", 100, 60, 500, 90, angle),
  line("항목", 50, 150, 150, 174, angle),
  line("전월", 300, 150, 380, 174, angle),
  line("당월", 420, 150, 500, 174, angle),
  line("일반관리비", 50, 200, 200, 224, angle),
  line("50,000", 300, 200, 380, 224, angle),
  line("52,000", 420, 200, 500, 224, angle),
  line("전기료", 50, 240, 200, 264, angle),
  line("30,000", 300, 240, 380, 264, angle),
  line("28,000", 420, 240, 500, 264, angle),
  line("수도료", 50, 280, 200, 304, angle),
  line("10,000", 300, 280, 380, 304, angle),
  line("12,000", 420, 280, 500, 304, angle),
  line("합계", 50, 330, 200, 354, angle),
  line("90,000", 300, 330, 380, 354, angle),
  line("92,000", 420, 330, 500, 354, angle),
  line("납부기한 2026.10.25", 50, 400, 400, 424, angle),
];

export const MEMO_CAPTURE: OcrLineInput[] = [
  line("10월", 40, 30, 120, 70),
  line("5 가상헬스 50,000", 40, 100, 400, 140),
  line("(월 회원권)", 80, 145, 300, 175),
  line("12 가상대출 이자 120,000 (3000만원)", 40, 200, 560, 240),
  line("25 관리비 150,000", 40, 260, 400, 300),
  line("31 가상보험 45,000", 40, 320, 400, 360),
  line("합계 365,000", 40, 400, 400, 440),
];
