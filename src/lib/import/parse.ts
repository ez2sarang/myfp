// 인식 줄(글자·상자) → 항목 초안 (순수 모듈). 보고서 7절의 파서 4종: 카드 앱 목록·영수증·관리비 고지서 표·손글씨 메모.
// 모든 파서는 상자 좌표를 기울기 보정(넓은 상자의 윗변 각도 중앙값, ±8도 안)한 뒤 행으로 묶어 쓴다.
// 인식 점수는 쓰지 않는다(맞은 줄과 틀린 줄의 점수가 겹친다). 입력만으로 결과가 정해진다(시계·DB·네트워크 없음).
import { amountsIn, dateFromDay, hasHangul, isCancelText, parseAmount, parseDate, parseInstallment, type AmountResult } from "./normalize.ts";
import type { CaptureContext, Layout, OcrLineInput, Point, Reason } from "./types.ts";

export interface Item {
  i: number;
  text: string;
  box: Point[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cx: number;
  cy: number;
  h: number;
}

/** 파서가 내는 초안. 신뢰도·분류·중복은 build 단계에서 정한다 */
export interface Draft {
  layout: Layout;
  role: "item" | "total";
  name: string;
  amount: AmountResult | null;
  date: string | null;
  time: string | null;
  dateSource: "direct" | "header" | "inherited" | "context" | null;
  dayOutOfRange: boolean;
  installment: { current: number | null; total: number | null } | null;
  cancelled: boolean;
  /** 분류 신호를 찾을 글자(이름 + 같은 행·묶음의 다른 글자) */
  context: string;
  /** 파서가 이미 아는 분류 신호 (손글씨 대출 행에서 떼어 낸 잔액 등) */
  hint?: "loan-balance";
  extraReasons: Reason[];
  lines: number[];
  box: Point[] | null;
}

const MAX_SKEW = (8 * Math.PI) / 180;

/** 기울기 보정한 상자들. 각도 = 가로가 세로의 2배 넘는 상자의 윗변 각도 중앙값(±8도로 자름) */
export function layoutItems(lines: readonly OcrLineInput[]): Item[] {
  const angles = lines
    .map((l) => l.box)
    .filter((b) => b.length === 4 && Math.hypot(b[1]![0] - b[0]![0], b[1]![1] - b[0]![1]) > 2 * Math.hypot(b[3]![0] - b[0]![0], b[3]![1] - b[0]![1]))
    .map((b) => Math.atan2(b[1]![1] - b[0]![1], b[1]![0] - b[0]![0]))
    .sort((a, b) => a - b);
  const median = angles.length === 0 ? 0 : angles.length % 2 ? angles[(angles.length - 1) / 2]! : (angles[angles.length / 2 - 1]! + angles[angles.length / 2]!) / 2;
  const angle = Math.max(-MAX_SKEW, Math.min(MAX_SKEW, median));
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return lines.map((l, i) => {
    const pts = l.box.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos] as Point);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    return { i, text: l.text.trim(), box: l.box, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0 };
  });
}

/** 세로로 절반 이상 겹치는 상자끼리 한 행. 행은 위→아래, 행 안은 왼→오른 */
export function groupRows(items: readonly Item[]): Item[][] {
  const rows: Item[][] = [];
  for (const item of [...items].sort((a, b) => a.cy - b.cy)) {
    const row = rows.find((r) => {
      const y0 = Math.min(...r.map((x) => x.y0));
      const y1 = Math.max(...r.map((x) => x.y1));
      const h = Math.min(...r.map((x) => x.h));
      return Math.min(y1, item.y1) - Math.max(y0, item.y0) >= 0.5 * Math.min(h, item.h);
    });
    if (row) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x0 - b.x0);
  return rows.sort((a, b) => Math.min(...a.map((x) => x.cy)) - Math.min(...b.map((x) => x.cy)));
}

const joinText = (items: readonly Item[]) => items.map((x) => x.text).join(" ").replace(/\s+/g, " ").trim();

function draft(layout: Layout, partial: Partial<Draft> & Pick<Draft, "name" | "lines">): Draft {
  return {
    layout,
    role: "item",
    amount: null,
    date: null,
    time: null,
    dateSource: null,
    dayOutOfRange: false,
    installment: null,
    cancelled: false,
    context: partial.name,
    extraReasons: [],
    box: null,
    ...partial,
  };
}

// 낱말 하나(관리비·합계)는 손글씨 메모에도 흔하므로 고지서·영수증에만 나오는 낱말로 고른다
const BILL_WORDS = /고지서|납부\s*기한|납기\s*내|부과\s*내역|당월\s*부과/;
const RECEIPT_WORDS = /영수증|사업자\s*(등록)?\s*번호|받을\s*금액|부가세|과세\s*물품|승인\s*번호|가맹점\s*번호/;
const TOTAL_WORDS = /합\s*계|총\s*(액|금액)/;
const DAY_ROW = /^\s*(\d{1,2})(?:\s*일|\s*[.)]|\s)\s*(?=\D)(.*)$/;

/** 레이아웃 추정: 고지서 낱말 → 영수증 낱말 → 손글씨(사진, 맨 앞 일 숫자 행이 2개 이상) → 오른쪽 `금액원` 상자 → 합계 낱말(영수증) */
export function detectLayout(lines: readonly OcrLineInput[], ctx: CaptureContext): Layout {
  const all = lines.map((l) => l.text).join("\n");
  if (BILL_WORDS.test(all)) return "bill";
  if (RECEIPT_WORDS.test(all)) return "receipt";
  const items = layoutItems(lines);
  const rightWon = items.filter((x) => x.cx > 0.55 * ctx.width && parseAmount(x.text)?.hasWon).length;
  const dayRows = groupRows(items).filter((r) => DAY_ROW.test(joinText(r))).length;
  if (ctx.source === "photo" && dayRows >= 2 && dayRows > rightWon) return "handwriting";
  if (rightWon > 0) return "card";
  if (TOTAL_WORDS.test(all)) return "receipt";
  return ctx.source === "photo" ? "handwriting" : "card";
}

const CARD_BILL = /결제\s*예정|청구\s*예정|결제하실\s*금액|이번\s*달\s*결제\s*금액/;

/** 카드 앱 목록: 오른쪽(x > 0.55W)의 `금액원` 상자가 행 기준, 같은 행 왼쪽이 이름, 날짜는 아래 150px 안의 YYYY.MM.DD HH:MM,
 *  없으면 위쪽에서 가장 가까운 N월 N일·MM.DD (요일) 헤더, 그것도 없으면 직전 캡처에서 이어받은 날짜. 결제예정금액 줄은 카드 대금 초안 */
export function parseCardList(lines: readonly OcrLineInput[], ctx: CaptureContext, { below = 150 } = {}): Draft[] {
  const items = layoutItems(lines);
  const rows = groupRows(items);
  const rowOf = new Map<number, Item[]>();
  for (const row of rows) for (const x of row) rowOf.set(x.i, row);
  const amountItems = items.filter((x) => x.cx > 0.55 * ctx.width && parseAmount(x.text)?.hasWon).sort((a, b) => a.cy - b.cy);
  const drafts: Draft[] = [];
  const used = new Set<number>();

  // 카드 결제예정금액: 낱말이 있는 행(또는 바로 아래 행)의 금액
  for (const label of items.filter((x) => CARD_BILL.test(x.text))) {
    const row = rowOf.get(label.i) ?? [label];
    const sameRow = row.filter((x) => x !== label && parseAmount(x.text));
    const inLabel = amountsIn(label.text).filter((a) => a.hasWon).at(-1);
    const next = amountItems.find((x) => x.cy > label.cy && x.cy - label.cy <= below && !used.has(x.i));
    const target = sameRow.at(-1) ?? (inLabel ? label : next);
    if (!target) continue;
    const amount = target === label ? (inLabel ?? null) : parseAmount(target.text);
    const cardName = items.find((x) => x !== label && /카드/.test(x.text) && !CARD_BILL.test(x.text) && x.cy < label.cy + below);
    used.add(target.i);
    drafts.push(
      draft("card", {
        role: "total",
        name: cardName?.text ?? "카드 결제예정금액",
        amount,
        context: `${label.text} ${cardName?.text ?? ""}`,
        lines: [...new Set([label.i, target.i, ...(cardName ? [cardName.i] : [])])],
        box: target.box,
      }),
    );
  }

  amountItems.forEach((amountItem, k) => {
    if (used.has(amountItem.i)) return;
    const row = rowOf.get(amountItem.i) ?? [amountItem];
    const nextCy = amountItems[k + 1]?.cy ?? Number.POSITIVE_INFINITY;
    const left = row.filter((x) => x.x1 <= amountItem.x0 + 2 && !parseAmount(x.text) && !parseDate(x.text, ctx.today));
    const block = items.filter((x) => x.cy > amountItem.cy && x.cy < nextCy && x.cy - amountItem.cy <= below);
    const dateLine = block.map((x) => ({ x, d: parseDate(x.text, ctx.today) })).find((v) => v.d?.format === "ymd");
    let date: { date: string | null; time: string | null; ok: boolean } | null = dateLine?.d ? { date: dateLine.d.date, time: dateLine.d.time, ok: dateLine.d.dayInRange } : null;
    let dateSource: Draft["dateSource"] = date ? "direct" : null;
    if (!date) {
      const header = items
        .filter((x) => x.cy < amountItem.cy && !row.includes(x))
        .map((x) => ({ x, d: parseDate(x.text, ctx.today) }))
        .filter((v) => v.d && v.d.format !== "ymd")
        .sort((a, b) => b.x.cy - a.x.cy)[0];
      if (header?.d) (date = { date: header.d.date, time: null, ok: header.d.dayInRange }), (dateSource = "header");
      else if (ctx.inheritedDate) (date = { date: ctx.inheritedDate, time: null, ok: true }), (dateSource = "inherited");
    }
    const amount = parseAmount(amountItem.text);
    const context = joinText([...row, ...block]);
    drafts.push(
      draft("card", {
        name: joinText(left),
        amount,
        date: date?.date ?? null,
        time: date?.time ?? null,
        dateSource,
        dayOutOfRange: date ? !date.ok : false,
        installment: parseInstallment(context),
        cancelled: Boolean(amount?.negative) || isCancelText(context),
        context,
        lines: [amountItem.i, ...left.map((x) => x.i), ...(dateLine ? [dateLine.x.i] : [])],
        box: amountItem.box,
      }),
    );
  });
  return drafts;
}

const TOTAL_KEYS = [/받을\s*금액/, /결제\s*금액/, /승인\s*금액/, /합\s*계/, /총\s*(액|금액)/];
const NOT_TOTAL = /부가세|과세|면세|공급\s*가/;
const NOT_ITEM = /합\s*계|부가세|과세|면세|공급\s*가|받을|결제|승인|거스름|현금|카드|할인|포인트|봉사료|총\s*(액|금액)|합\s*산/;

/** 영수증: 상호 = 위 25% 안에서 가장 큰 한글 상자, 일시 = 첫 날짜, 합계 = 받을·결제·승인금액·합계 줄의 금액(없으면 최댓값).
 *  품목(한글 이름 + 오른쪽 금액) 합이 합계와 다르면 sum-mismatch */
export function parseReceipt(lines: readonly OcrLineInput[], ctx: CaptureContext): Draft[] {
  const items = layoutItems(lines);
  const rows = groupRows(items);
  const top = items.filter((x) => hasHangul(x.text) && x.cy < 0.25 * ctx.height).sort((a, b) => b.h - a.h || a.cy - b.cy)[0];
  const name = (top?.text ?? "").replace(/^[\s*#\-=[\]()]+|[\s*#\-=[\]()]+$/g, "");
  let dated: { row: Item[]; d: NonNullable<ReturnType<typeof parseDate>> } | null = null;
  for (const row of rows) {
    const d = parseDate(joinText(row), ctx.today);
    if (d) {
      dated = { row, d };
      break;
    }
  }
  let total: { row: Item[]; amount: ReturnType<typeof amountsIn>[number] } | null = null;
  for (const key of TOTAL_KEYS) {
    for (const row of rows) {
      const text = joinText(row);
      if (!key.test(text) || NOT_TOTAL.test(text)) continue;
      const amount = amountsIn(text).filter((a) => a.value > 0).at(-1);
      if (amount) {
        total = { row, amount };
        break;
      }
    }
    if (total) break;
  }
  if (!total) {
    for (const row of rows) {
      const amount = amountsIn(joinText(row)).filter((a) => a.valid && a.value > 0 && !parseDate(joinText(row), ctx.today));
      for (const a of amount) if (!total || a.value > total.amount.value) total = { row, amount: a };
    }
  }
  const extraReasons: Reason[] = [];
  if (total) {
    const totalTop = Math.min(...total.row.map((x) => x.cy));
    const itemAmounts = rows
      .filter((r) => r !== total!.row && r !== dated?.row && !r.includes(top as Item) && Math.min(...r.map((x) => x.cy)) < totalTop)
      .map((r) => joinText(r))
      .filter((t) => hasHangul(t) && !NOT_ITEM.test(t) && !parseDate(t, ctx.today))
      .map((t) => amountsIn(t).filter((a) => a.valid).at(-1))
      .filter((a) => a !== undefined);
    const sum = itemAmounts.reduce((s, a) => s + a.value * (a.negative ? -1 : 1), 0);
    if (itemAmounts.length > 0 && sum !== total.amount.value) extraReasons.push("sum-mismatch");
  }
  const all = items.map((x) => x.text).join(" ");
  return [
    draft("receipt", {
      role: "total",
      name,
      amount: total?.amount ?? null,
      date: dated?.d.date ?? null,
      time: dated?.d.time ?? null,
      dateSource: dated ? "direct" : null,
      dayOutOfRange: dated ? !dated.d.dayInRange : false,
      installment: parseInstallment(all),
      cancelled: Boolean(total?.amount.negative) || isCancelText(all),
      context: `${name} ${all}`,
      extraReasons,
      lines: [...new Set([...(top ? [top.i] : []), ...(dated?.row.map((x) => x.i) ?? []), ...(total?.row.map((x) => x.i) ?? [])])],
      box: total?.row.at(-1)?.box ?? null,
    }),
  ];
}

const BILL_NAME_HEAD = /항목|내역|구분|명세/;
const BILL_AMOUNT_HEAD = /당월|이번\s*달|금액|부과|청구/;
const BILL_TOTAL = /합\s*계|총\s*(액|계)|납부\s*(할|하실)?\s*금액|청구\s*금액\s*합계|당월\s*부과\s*(액|금액)?\s*합계/;

/** 관리비 고지서 표: 머리글(항목·금액)의 열 위치로 상자를 배정한다. 머리글이 없으면 행의 맨 왼쪽 한글 = 이름, 맨 오른쪽 금액.
 *  합계 줄은 total, 납부기한 날짜를 합계에 붙이고, 품목 합 ≠ 합계면 sum-mismatch */
export function parseBillTable(lines: readonly OcrLineInput[], ctx: CaptureContext): Draft[] {
  const rows = groupRows(layoutItems(lines));
  const headerIndex = rows.findIndex((r) => r.some((x) => BILL_NAME_HEAD.test(x.text)) && r.some((x) => BILL_AMOUNT_HEAD.test(x.text) && !/전월|지난/.test(x.text)));
  const header = headerIndex >= 0 ? rows[headerIndex]! : null;
  const nameX = header?.find((x) => BILL_NAME_HEAD.test(x.text))?.cx;
  const amountX = header?.filter((x) => BILL_AMOUNT_HEAD.test(x.text) && !/전월|지난/.test(x.text)).at(-1)?.cx;
  const dueRow = rows.find((r) => /납부\s*기한|납기/.test(joinText(r)));
  const allText = lines.map((l) => l.text).join(" ");
  const due = dueRow ? parseDate(joinText(dueRow), ctx.today) : null;
  const drafts: Draft[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (row === dueRow) continue;
    const withAmount = row.map((x) => ({ x, a: amountsIn(x.text).filter((v) => v.value > 0).at(-1) })).filter((v) => v.a && !parseDate(v.x.text, ctx.today));
    if (withAmount.length === 0) continue;
    const pick = amountX === undefined ? withAmount.at(-1)! : withAmount.reduce((b, v) => (Math.abs(v.x.cx - amountX) < Math.abs(b.x.cx - amountX) ? v : b));
    const names = row.filter((x) => x !== pick.x && hasHangul(x.text) && !parseAmount(x.text));
    const nameItem = nameX === undefined ? names[0] : names.sort((a, b) => Math.abs(a.cx - nameX) - Math.abs(b.cx - nameX))[0];
    const name = nameItem?.text ?? pick.x.text.replace(/\s+/g, " ").slice(0, pick.a!.start).trim();
    if (!hasHangul(name)) continue;
    const isTotal = BILL_TOTAL.test(joinText(row));
    drafts.push(
      draft("bill", {
        role: isTotal ? "total" : "item",
        name,
        amount: pick.a!,
        date: isTotal ? (due?.date ?? null) : null,
        dateSource: isTotal && due?.date ? "direct" : null,
        dayOutOfRange: isTotal && due ? !due.dayInRange : false,
        cancelled: Boolean(pick.a!.negative),
        // 합계는 고지서 전체 글자(관리비·전기요금 등)로, 품목은 그 행 글자로 분류한다
        context: isTotal ? allText : joinText(row),
        lines: row.map((x) => x.i),
        box: pick.x.box,
      }),
    );
  }
  const totals = drafts.filter((d) => d.role === "total");
  const itemSum = drafts.filter((d) => d.role === "item").reduce((s, d) => s + (d.amount?.value ?? 0) * (d.amount?.negative ? -1 : 1), 0);
  if (totals.length === 1 && drafts.some((d) => d.role === "item") && itemSum !== totals[0]!.amount?.value) totals[0]!.extraReasons.push("sum-mismatch");
  return drafts;
}

const LOAN_WORD = /대출|융자/;
const BALANCE_WORD = /잔액|원금|대출금/;

/** 손글씨 메모: 첫 줄의 'N월' = 월 맥락, 행 = 맨 앞 1~31(일), 금액 = 괄호 밖 가장 오른쪽 숫자 묶음,
 *  다음 줄의 괄호 설명은 윗 행 이름에 붙인다. 대출 행의 괄호 안 'N만원'·잔액 표기는 부채(잔액) 초안을 따로 만든다 */
export function parseHandwriting(lines: readonly OcrLineInput[], ctx: CaptureContext): Draft[] {
  const rows = groupRows(layoutItems(lines));
  const first = rows[0] ? joinText(rows[0]) : "";
  const monthMatch = /^\s*(\d{1,2})\s*월/.exec(first);
  const month = monthMatch ? Number(monthMatch[1]) : Number(ctx.today.slice(5, 7));
  const drafts: Draft[] = [];
  let last: Draft | null = null;
  for (const row of monthMatch ? rows.slice(1) : rows) {
    const text = joinText(row);
    const dayRow = DAY_ROW.exec(text);
    if (!dayRow || Number(dayRow[1]) < 1 || Number(dayRow[1]) > 31) {
      if (last && /^\s*[(（]/.test(text)) {
        last.name = `${last.name} ${text}`.trim();
        last.context = `${last.context} ${text}`;
        last.lines.push(...row.map((x) => x.i));
      }
      continue;
    }
    const day = Number(dayRow[1]);
    const rest = dayRow[2] ?? "";
    const amount = amountsIn(rest, { outsideParens: true }).at(-1) ?? null;
    const name = (amount ? `${rest.slice(0, amount.start)} ${rest.slice(amount.end)}` : rest).replace(/\s+/g, " ").trim();
    const { date, dayInRange } = dateFromDay(month, day, ctx.today);
    last = draft("handwriting", {
      name,
      amount,
      date,
      dateSource: "context",
      dayOutOfRange: !dayInRange,
      installment: parseInstallment(rest),
      cancelled: Boolean(amount?.negative) || isCancelText(rest),
      context: rest,
      lines: row.map((x) => x.i),
      box: row.at(-1)?.box ?? null,
    });
    drafts.push(last);
  }
  // 대출 잔액: 괄호 안 'N만원' 이나 잔액·원금·대출금 표기 → 부채 초안(같은 행의 이자·상환액 초안은 그대로 둔다)
  for (const d of [...drafts]) {
    if (!LOAN_WORD.test(d.context) && !BALANCE_WORD.test(d.context)) continue;
    const inParens = [...d.name.matchAll(/[(（]([^)）]*)[)）]/g)].map((m) => m[1] ?? "");
    const principal = inParens.map((t) => ({ t, a: amountsIn(t).at(-1) })).find((v) => v.a && (/만/.test(v.t) || BALANCE_WORD.test(v.t)));
    if (!principal?.a) continue;
    const base = d.name.replace(/[(（][^)）]*[)）]/g, "").replace(/이자|상환액?/g, "").replace(/\s+/g, " ").trim();
    drafts.push({ ...d, role: "item", name: `${base} 잔액`, amount: principal.a, installment: null, hint: "loan-balance", context: d.context, lines: [...d.lines] });
    // 원래 행(이자·상환액)은 괄호 안 잔액 표기 없이 분류한다
    d.context = d.context.replace(/[(（][^)）]*[)）]/g, " ");
  }
  return drafts;
}

export function parseCapture(lines: readonly OcrLineInput[], ctx: CaptureContext): Draft[] {
  const layout = ctx.layout ?? detectLayout(lines, ctx);
  if (layout === "receipt") return parseReceipt(lines, ctx);
  if (layout === "bill") return parseBillTable(lines, ctx);
  if (layout === "handwriting") return parseHandwriting(lines, ctx);
  return parseCardList(lines, ctx);
}
