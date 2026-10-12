import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "개인정보 처리방침" };

export default function PrivacyPage() {
  return (
    <LegalPage title="개인정보 처리방침" effective="2026년 10월 12일">
      <section>
        <h2>1. 수집하는 정보</h2>
        <ul>
          <li>로그인 정보: Google 계정의 이메일(검증된 경우)·이름·프로필 이미지, 카카오 계정의 닉네임·프로필 이미지. 카카오 로그인에서는 이메일을 받지 않습니다.</li>
          <li>사용자가 직접 입력한 재무 항목: 고정지출(이름·분류·금액·납부일·결제수단·기관명·기간·메모), 자산·부채(이름·분류·금액·기준일·메모 등).</li>
          <li>공유 링크 설정과 열람 횟수·마지막 열람 시각. 열람자의 IP 나 기기 정보는 저장하지 않습니다.</li>
          <li>로그인 공급자의 액세스·리프레시 토큰은 저장하지 않습니다.</li>
        </ul>
      </section>
      <section>
        <h2>2. 이용 목적</h2>
        <p>
          {SITE_NAME} 은 수집한 정보를 본인 확인, 사용자가 입력한 재무 정보의 저장·계산·표시, 사용자가 만든 읽기 전용 공유 링크 제공에만 사용합니다. 광고나 제3자
          판매에 쓰지 않습니다.
        </p>
      </section>
      <section>
        <h2>3. 공유</h2>
        <p>사용자가 공유 링크를 만든 경우에만, 사용자가 고른 항목이 링크를 가진 사람에게 읽기 전용으로 보입니다. 공유 보기에는 이메일·이름 같은 식별 정보가 나오지 않습니다.</p>
      </section>
      <section>
        <h2>4. 보관과 삭제</h2>
        <ul>
          <li>설정 화면의 「내 데이터 전체 삭제」로 고정지출·자산/부채·공유 링크를 즉시 삭제할 수 있습니다.</li>
          <li>공유 링크는 언제든 폐기할 수 있고, 폐기·만료된 링크로는 볼 수 없습니다.</li>
          <li>계정 자체의 삭제는 관리자에게 요청할 수 있습니다.</li>
        </ul>
      </section>
      <section>
        <h2>5. 보안</h2>
        <p>모든 통신은 HTTPS 로 암호화되고, 데이터 접근은 서버에서 본인 데이터로만 제한됩니다. 공유 링크 주소는 서버에 해시로만 저장됩니다.</p>
      </section>
    </LegalPage>
  );
}
