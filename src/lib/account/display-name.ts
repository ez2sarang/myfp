// 표시 이름 검증 (순수 모듈). 사용자가 직접 정하는 선택 항목으로, 본인과 관리자만 본다.
//  - 앞뒤 공백을 지운 뒤 1~30자. 길이는 문자(code point) 수로 센다(DB 의 char_length 와 같다). 이모지는 허용한다.
//  - 제어 문자·줄바꿈·줄/문단 구분자·양방향 서식 문자(글자 방향을 뒤집어 다른 이름처럼 보이게 하는 문자)는 거부한다.
//  - HTML 은 그대로 저장하고, 화면에서는 React 가 이스케이프한다.

export const DISPLAY_NAME_MAX = 30;

// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

export type DisplayNameResult = { ok: true; value: string } | { ok: false; message: string };

export function validateDisplayName(raw: unknown): DisplayNameResult {
  if (typeof raw !== "string") return { ok: false, message: "표시 이름을 입력해 주세요." };
  if (FORBIDDEN.test(raw)) return { ok: false, message: "줄바꿈이나 제어 문자는 쓸 수 없습니다." };
  const value = raw.trim();
  const length = [...value].length;
  if (length === 0) return { ok: false, message: "표시 이름을 입력해 주세요. 지우려면 「지우기」를 누르세요." };
  if (length > DISPLAY_NAME_MAX) return { ok: false, message: `표시 이름은 ${DISPLAY_NAME_MAX}자 이하로 입력해 주세요.` };
  return { ok: true, value };
}
