// 개발·검증 전용 Next 어댑터 (운영 build 스크립트·vercel.json 에는 절대 넣지 않는다 — tests/ocr-headers.test.ts 가 단언).
// 목적: Vercel 빌드처럼 불변 정적 자산(supportsImmutableAssets)을 켜서, 청크가 <distDir>/static/immutable/chunks 로 나가고
// /_next/static/immutable/chunks/… 로 서빙되는 빌드를 로컬에서 재현한다. 워커 CSP 규칙·scripts/check-ocr-worker.mjs 가 이 경로도
// 맞는지 푸시 전에 확인하는 데 쓴다(2026-10-12, 이 차이로 Vercel 빌드가 실패한 일이 있다).
// 사용: npm run build:vercel-like (NEXT_ADAPTER_PATH 로 이 파일을 지정해 copy-ort → next build → check-ocr-worker).
// 근거 문서: node_modules/next/dist/docs/01-app/03-api-reference/07-adapters/01-configuration.md (NEXT_ADAPTER_PATH),
//   07-adapters/12-immutable-static-assets.md (modifyConfig 예시), 05-config/01-next-config-js/supportsImmutableAssets.md.
// Vercel 의 실제 어댑터 코드가 아니라 그 동작 중 불변 자산 켜기만 흉내 낸다. 의존성 없음, 비밀·환경변수 없음.

/** @type {import('next').NextAdapter} */
const adapter = {
  name: "myfp-immutable-assets-repro",

  async modifyConfig(config, { phase }) {
    if (phase === "phase-production-build") config.supportsImmutableAssets = config.supportsImmutableAssets ?? true;
    return config;
  },

  async onBuildComplete({ outputs }) {
    const worker = outputs.staticFiles.filter((f) => /\/turbopack-worker-[^/]+\.js$/.test(f.pathname)).map((f) => f.pathname);
    console.log(`[immutable-assets-adapter] 워커 진입 파일 서빙 경로: ${worker.join(", ") || "(없음)"}`);
  },
};

export default adapter;
