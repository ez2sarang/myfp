// 사용자가 정하는 짧은 이름(표시 이름·그룹 이름·그룹 태그) 검증 (순수 모듈). 표시 이름은 본인과 관리자만 본다.
//  - 유니코드 정규화(NFC) 뒤 앞뒤 공백을 지우고 길이를 문자(code point) 수로 센다(DB 의 char_length 와 같다).
//    NFC 로 맞추므로 조합형·완성형으로 다르게 입력한 같은 글자가 서로 다른 이름이 되지 않는다.
//  - 거부: 제어 문자·줄바꿈·줄/문단 구분자, 서식 문자(\p{Cf}: 폭 없는 문자·양방향 서식·소프트 하이픈·태그 문자 등),
//    한글 채움 문자(U+3164·U+115F·U+1160·U+FFA0), 결합 문자 3개 이상 연속. 보이는 글자(문자·숫자)가 하나 이상 있어야 한다.
//    (같은 그룹 안에서 「엄마」와 「엄마+폭 없는 문자」처럼 겉보기에 같은 이름이 공존하지 못하게 한다.) 이모지는 글자와 함께 쓸 수 있다.
//  - HTML 은 그대로 저장하고, 화면에서는 React 가 이스케이프한다.

export const DISPLAY_NAME_MAX = 30;

// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}\u00ad\u3164\u115f\u1160\uffa0\u{E0000}-\u{E007F}]/u;
const MARK_RUN = /\p{M}{3,}/u;
const VISIBLE = /[\p{L}\p{N}]/u;

export type ShortNameCheck = { ok: true; value: string } | { ok: false; reason: "empty" | "forbidden" | "long" | "marks" | "invisible" };

/** 짧은 이름 공통 규칙. 통과하면 정규화한 값을 돌려준다 */
export function checkShortName(raw: unknown, max: number): ShortNameCheck {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const normalized = raw.normalize("NFC");
  if (FORBIDDEN.test(normalized)) return { ok: false, reason: "forbidden" };
  const value = normalized.trim();
  const length = [...value].length;
  if (length === 0) return { ok: false, reason: "empty" };
  if (length > max) return { ok: false, reason: "long" };
  if (MARK_RUN.test(value)) return { ok: false, reason: "marks" };
  if (!VISIBLE.test(value)) return { ok: false, reason: "invisible" };
  return { ok: true, value };
}

const FORBIDDEN_ALL = new RegExp(FORBIDDEN.source, "gu");

/** 눈에 보이는 글자·숫자가 하나라도 있는지 (보이지 않는 문자·채움 문자를 빼고 본다. 공백·이모지만 있으면 false).
 *  이름 관문이 소셜 프로필 이름처럼 이 규칙으로 저장되지 않은 값도 판정할 때 쓴다 */
export function hasVisibleName(raw: unknown): boolean {
  return typeof raw === "string" && VISIBLE.test(raw.normalize("NFC").replace(FORBIDDEN_ALL, ""));
}

/** 규칙 위반 사유 → 화면 문장 (label: 「표시 이름」·「태그」 등, empty 는 따로 줄 수 있다) */
export function shortNameMessage(reason: Exclude<ShortNameCheck, { ok: true }>["reason"], label: string, max: number, emptyMessage?: string): string {
  switch (reason) {
    case "empty":
      return emptyMessage ?? `${label}을 입력해 주세요.`;
    case "forbidden":
      return "줄바꿈·제어 문자나 보이지 않는 문자(폭 없는 문자·채움 문자 등)는 쓸 수 없습니다.";
    case "long":
      return `${label}은 ${max}자 이하로 입력해 주세요.`;
    case "marks":
      return "결합 문자를 너무 많이 겹쳐 쓸 수 없습니다.";
    case "invisible":
      return "글자나 숫자를 하나 이상 넣어 주세요.";
  }
}

export type DisplayNameResult = { ok: true; value: string } | { ok: false; message: string };

export function validateDisplayName(raw: unknown): DisplayNameResult {
  const r = checkShortName(raw, DISPLAY_NAME_MAX);
  if (r.ok) return r;
  return { ok: false, message: shortNameMessage(r.reason, "표시 이름", DISPLAY_NAME_MAX, "표시 이름을 입력해 주세요. 지우려면 「지우기」를 누르세요.") };
}
