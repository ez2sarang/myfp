import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <LegalPage title="이용약관" effective="2026년 10월 12일">
      <section>
        <h2>1. 서비스</h2>
        <p>{SITE_NAME} 은 개인이 자신의 고정지출과 자산·부채를 기록하고, 원하면 읽기 전용 링크로 공유할 수 있게 하는 도구입니다.</p>
      </section>
      <section>
        <h2>2. 가입과 승인</h2>
        <p>Google 또는 카카오 계정으로 로그인하면 가입 신청이 접수되며, 운영자가 승인한 뒤 이용할 수 있습니다. 운영자는 부정 이용이 확인되면 이용을 제한할 수 있습니다.</p>
      </section>
      <section>
        <h2>3. 사용자의 책임</h2>
        <ul>
          <li>입력한 정보의 정확성과, 공유 링크를 누구에게 전달하는지는 사용자 책임입니다.</li>
          <li>공유 링크 주소를 가진 사람은 누구나 그 내용을 볼 수 있습니다. 필요 없어진 링크는 폐기해 주세요.</li>
        </ul>
      </section>
      <section>
        <h2>4. 면책</h2>
        <p>계산 결과(합계·일정·남은 횟수·남은 납입 총액 등)는 입력값에 기반한 추정이며 금융기관의 실제 청구와 다를 수 있습니다. 이 서비스는 금융·투자·법률 자문을 제공하지 않습니다.</p>
      </section>
      <section>
        <h2>5. 변경</h2>
        <p>약관이 바뀌면 이 페이지에 시행일과 함께 게시합니다.</p>
      </section>
    </LegalPage>
  );
}
