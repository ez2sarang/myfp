// 서버 액션과 클라이언트 폼이 함께 쓰는 결과 형식. 메시지는 화면에 그대로 보이는 한국어 문장이다.
export type ActionState = {
  ok: boolean;
  message: string;
  /** 필드별 검증 오류 (필드 이름 → 문장) */
  errors?: Record<string, string>;
  /** 검증 실패 시 다시 채워 줄 입력값 (폼이 초기화되므로) */
  values?: Record<string, string>;
  /** 공유 링크 생성 직후 한 번만 돌려주는 전체 주소 */
  shareUrl?: string;
} | null;

/** FormData 에서 문자열 필드만 꺼낸다 (파일·중복 값은 버리고, 길이를 자른다). user_id 같은 소유자 필드는 쓰는 쪽이 읽지 않는다. */
export function formFields(formData: FormData, max = 2000): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !(key in out) && !key.startsWith("$ACTION")) out[key] = value.slice(0, max);
  }
  return out;
}

/** 내 데이터 전체 삭제 확인 문구 */
export const DELETE_CONFIRM_PHRASE = "내 데이터 삭제";
