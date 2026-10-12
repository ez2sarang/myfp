import dynamic from "next/dynamic";
import { AD_LABEL, AD_SLOT_MIN_HEIGHT, adsEnabledFor, isValidAdSlot, readAdEnv } from "@/lib/ads/config";

// 광고 단위(클라이언트 컴포넌트)는 serve 빌드에서만 번들에 넣는다. MYFP_ADS_SERVE_BUILD 는 next.config 의 env 로 빌드 때 상수가 되어,
// off 빌드에서는 이 분기와 import 가 통째로 빠진다(빌드 산출물 grep 으로 확인).
const AdUnit = process.env.MYFP_ADS_SERVE_BUILD === "1" ? dynamic(() => import("./ad-unit").then((m) => m.AdUnit)) : null;

// 광고 자리 (서버 컴포넌트). mode=serve·유효한 client·광고 단위 id·허용 경로(/guide/<slug>)일 때만 그린다. 그 밖에는 아무것도 내지 않는다.
// 고정 높이 컨테이너로 자리를 미리 잡아 늦게 채워져도 본문이 밀리지 않게 한다. 버튼·내비게이션 가까이에 두지 않는다(배치는 글 상세 페이지가 정한다).
export function AdSlot({ pathname }: { pathname: string }) {
  const env = readAdEnv();
  if (!adsEnabledFor(pathname, env) || !isValidAdSlot(env.slot) || !AdUnit) return null;
  return (
    <aside aria-label={AD_LABEL} className="my-10 border-y border-line py-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">{AD_LABEL}</p>
      <div style={{ minHeight: AD_SLOT_MIN_HEIGHT }}>
        <AdUnit client={env.client as string} slot={env.slot} />
      </div>
    </aside>
  );
}
