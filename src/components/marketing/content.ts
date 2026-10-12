// 소개 페이지 문구 (순수 모듈). 디자인 단계에서 문구만 바꿀 때 이 파일만 고치면 된다. 데모 숫자는 모두 가짜 예시다.
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const PAGE_META = {
  title: `${SITE_NAME} — 고정지출·자산 관리, 읽기 전용 공유`,
  description: SITE_DESCRIPTION,
  canonical: SITE_URL,
};

export const HERO = {
  eyebrow: "개인 재무 정리 도구",
  title: "매달 나가는 돈, 한눈에 정리하세요",
  lead: SITE_TAGLINE,
  primaryCta: { href: "/login", label: "무료로 시작하기" },
  secondaryCta: { href: "#how", label: "어떻게 동작하나요?" },
};

// 히어로 오른쪽 데모 카드의 가짜 숫자 (실제 사용자 데이터 아님)
export const DEMO = {
  monthlyTotal: 1_284_000,
  upcoming: [
    { name: "월세", day: "25일", amount: 650_000 },
    { name: "휴대폰 요금", day: "말일", amount: 49_000 },
    { name: "음악 구독", day: "3일", amount: 10_900 },
  ],
  categories: [
    { label: "주거", share: 51 },
    { label: "보험", share: 19 },
    { label: "통신", share: 12 },
    { label: "기타", share: 18 },
  ],
};

export const FEATURES = [
  {
    title: "고정지출 한 곳에",
    body: "대출 이자, 보험료, 통신비, 구독료까지. 납부일·결제수단·종료일과 함께 기록하고 이번 달 합계와 남은 납부액을 바로 확인합니다.",
  },
  {
    title: "다음 30일 납부 일정",
    body: "언제 얼마가 빠져나가는지 날짜순으로 보여 줍니다. 31일 납부는 말일로 자동 처리합니다.",
  },
  {
    title: "상환 타임라인과 순자산",
    body: "대출이 언제 끝나는지, 남은 횟수와 남은 납입 총액을 추정합니다. 자산과 부채를 넣으면 순자산이 계산됩니다.",
  },
  {
    title: "읽기 전용 공유 링크",
    body: "가족이나 상담사에게 필요한 부분만 공유하세요. 금액·메모를 가릴 수 있고, 만료일을 정하고, 언제든 즉시 폐기할 수 있습니다.",
  },
];

export const STEPS = [
  { title: "로그인", body: "Google 또는 카카오 계정으로 로그인합니다. 별도 비밀번호가 없습니다." },
  { title: "항목 입력", body: "고정지출과 자산·부채를 입력합니다. 남은 횟수만 알아도 종료일이 계산됩니다." },
  { title: "확인하고 공유", body: "대시보드에서 합계·일정·타임라인을 보고, 필요하면 읽기 전용 링크를 만듭니다." },
];

export const SECURITY = [
  { title: "내 데이터는 나만", body: "모든 조회·수정은 서버에서 로그인한 본인 데이터로만 제한됩니다." },
  { title: "링크는 해시로만 보관", body: "공유 링크 주소는 만든 순간 한 번만 보여 주고, 서버에는 복원할 수 없는 해시만 저장합니다." },
  { title: "가린 값은 보내지 않음", body: "숨긴 금액·메모는 화면에서 감추는 것이 아니라 서버에서 지운 뒤 보냅니다." },
  { title: "검색 노출 차단", body: "공유 보기는 검색엔진 색인과 캐시를 막고, 다른 사이트로 주소가 새지 않게 합니다." },
];

export const CTA = {
  title: "이번 달 고정지출, 5분이면 정리됩니다",
  body: "가입 후 승인되면 바로 사용할 수 있습니다.",
  action: { href: "/login", label: "시작하기" },
};
