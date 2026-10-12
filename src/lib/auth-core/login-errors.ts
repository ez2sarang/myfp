// 로그인 화면 오류 코드 → 한국어 안내 (순수 모듈). 알 수 없는 코드는 일반 문구로 대체해 내부 정보를 드러내지 않는다.
const MESSAGES: Record<string, string> = {
  AccessDenied: "이 계정으로는 로그인할 수 없습니다. 이용이 제한된 계정이거나 로그인 정보가 확인되지 않았습니다.",
  CredentialsSignin: "관리자 로그인 정보가 올바르지 않거나 잠시 로그인이 제한되었습니다. 잠시 뒤 다시 시도해 주세요.",
  Configuration: "로그인 설정에 문제가 있습니다. 관리자에게 문의해 주세요.",
  OAuthAccountNotLinked: "이미 다른 방법으로 가입한 계정입니다. 처음 사용한 로그인 방법으로 다시 시도해 주세요.",
  OAuthCallbackError: "로그인 서비스에서 응답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  OAuthSignin: "로그인 서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  SessionRequired: "로그인이 필요합니다.",
  Verification: "로그인 링크가 만료되었거나 이미 사용되었습니다.",
};

const FALLBACK = "로그인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";

export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(MESSAGES, code) ? (MESSAGES[code] as string) : FALLBACK;
}
