# myfp

내 고정지출과 자산을 한 곳에서 — 읽기 전용 링크로 안전하게 공유.

myfp 는 매달·매년 나가는 고정지출(대출 이자·보험료·통신비·구독료 등), 자산과 부채를 정리하는 개인 재무 웹입니다.
다음 30일 납부 일정, 대출 상환 타임라인, 순자산을 계산하고, 필요한 부분만 로그인 없이 볼 수 있는 읽기 전용 링크로 공유할 수 있습니다.

## 기능

| 영역 | 내용 |
|------|------|
| 공개 | 소개 페이지 `/`, 로그인 `/login`(Google·Kakao), `/privacy`, `/terms`, 공유 보기 `/s/<토큰>`, `/api/health` |
| 대시보드 `/app` | 월 고정지출 합계(연 주기 항목은 ÷12 로 월 환산), 이번 달 남은 납부액, 다음 납부 D-day, 순자산, 분류 도넛 + 세부 항목(정렬·필터), 향후 12개월 막대, 30일 일정, 부채 상환 타임라인 |
| 고정지출 `/app/fixed` | 목록(분류 필터·정렬·활성 토글·보관/삭제), 추가·수정. 남은 횟수 입력은 저장 시 종료일로 정규화 |
| 자산·부채 `/app/assets` | 자산(현금·예금·투자·부동산·기타), 부채(대출·카드·기타, 월 상환액·금리·종료일 선택) |
| 공유 링크 `/app/share` | 섹션 선택, 금액·메모/기관명 가리기, 만료(7/30/90일·무기한), 즉시 폐기, 열람 횟수. 활성 링크 최대 10개 |
| 설정 `/app/settings` | 계정 정보, CSV 내보내기, 내 데이터 전체 삭제, 로그아웃 |
| 관리 `/admin/users` | 가입 승인·차단 (자기 자신·마지막 관리자 보호, 감사 기록) |

## 스택

Next.js 16 (App Router, Turbopack) · React 19 · Auth.js 5 (Google·Kakao, JWT 세션) · PostgreSQL (`pg`) · Tailwind CSS 4 · Recharts.
의존성은 정확한 버전으로 고정하고 `package-lock.json` 을 커밋합니다.

## 로컬 실행

```bash
npm ci --ignore-scripts
cp .env.example .env.local   # 값을 채운다 (AUTH_URL=http://localhost:3330)
npm run migrate              # MIGRATE_DATABASE_URL(또는 DATABASE_URL) 로 db/migrations 적용
npm run dev                  # http://localhost:3330
```

검사:

```bash
npm run typecheck && npm test && npm run build && npm run scan
```

`npm test` 는 DB 없이 돕니다(쿼리 계층은 가짜 Db 를 주입해 시험). `npm run scan` 은 커밋 대상 파일에서 비밀값·개인정보 패턴을 찾습니다.

## 환경 변수

값은 `.env.local`(로컬) 또는 배포 환경 변수에만 둡니다. 설명은 `.env.example` 에 있습니다.

| 변수 | 용도 |
|------|------|
| `AUTH_SECRET` | 세션 토큰 서명 |
| `AUTH_URL` | 사이트 기준 주소 (서버 액션 Origin 허용 호스트, 공유 주소) |
| `AUTH_TRUST_HOST` | (참고) 코드에서 trustHost 를 고정한다 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET` | Kakao OAuth |
| `DATABASE_URL` | 앱 실행용 연결 (스키마 `myfp` 제한 역할) |
| `MIGRATE_DATABASE_URL` | 마이그레이션 전용 연결 (배포 환경에는 넣지 않음) |
| `DATABASE_CA` | (선택) DB 인증서 검증용 CA |
| `ADMIN_EMAILS` | 자동 승인·관리자 이메일(쉼표 구분). 검증된 Google 이메일·비상 로그인에만 적용 |
| `AUTH_ENABLE_CREDENTIALS`, `ADMIN_BOOTSTRAP_PASSWORD_HASH` | 비상 관리자 로그인 (기본 꺼짐) |
| `APP_ENV` | 실행 환경 표시 |

## 보안 모델

- **로그인 관문 2겹**: `src/proxy.ts` 가 공개 허용 목록 밖의 경로에서 세션 쿠키를 확인하고, 모든 보호 페이지·서버 액션·라우트 핸들러가 `src/lib/session.ts` 의 `requireActiveUser`/`requireAdmin` 으로 DB 기준 계정 상태를 다시 확인합니다.
- **본인 데이터만**: 모든 사용자 데이터 쿼리는 `WHERE user_id = <세션 사용자>` 로 묶입니다. 서버 액션은 폼의 사용자 id 를 읽지 않습니다.
- **서버 액션 CSRF 보강**: 모든 액션의 첫 문장이 `assertSameOrigin()` (Origin 필수, 같은 사이트만).
- **승인제 가입**: 신규 가입은 승인 대기. `ADMIN_EMAILS` 의 검증된 Google 이메일만 자동 승인·관리자. Kakao 는 이메일을 쓰지 않으며 이메일로 기존 계정에 연결되지 않습니다.
- **공유 링크**: 256비트 무작위 토큰(base64url), DB 에는 SHA-256 해시만 저장. 무효·만료·폐기·형식 오류는 같은 404. 가린 값은 서버에서 제거한 뒤 렌더링. `noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. 쓰기 경로 없음.
- **헤더**: CSP, `X-Frame-Options: DENY`, HSTS, `nosniff`, Permissions-Policy, `poweredByHeader: false`.
- **금액**: 원 단위 정수(`bigint`), 부동소수 없음. 사용자당 상한(고정지출 300, 자산·부채 100, 활성 공유 링크 10).

## 데이터베이스

PostgreSQL 스키마 `myfp` 하나만 씁니다. 마이그레이션은 `db/migrations/*.sql` (멱등, 모든 객체에 `myfp.` 명시)이고
`npm run migrate` 가 이름 순으로 적용합니다. 앱 역할(`myfp_app`)은 별도로 만들며, 마이그레이션이 필요한 권한만 부여합니다.

개인 데이터 적재(저장소 밖 시드 파일): `node scripts/import-private.mjs <seed.json>` (기본 dry-run, `--apply` 시 멱등 upsert). 출력은 건수만.
`--apply` 는 같은 키(external_key)의 기존 행을 시드 값으로 덮어씁니다. 화면에서 고친 값을 보존하려면 `--apply --skip-existing` 으로 새 키만 넣습니다.

TLS: 앱·마이그레이션·적재 스크립트가 같은 규칙을 씁니다. 원격 DB 는 TLS 로 접속하고, 운영에서는 `DATABASE_CA` 에 DB 서버 CA(PEM)를 넣어 인증서 검증까지 켜는 것을 권장합니다(없으면 암호화만 하고 서버 신원은 검증하지 않음).

## 배포

Vercel 프로젝트에 이 저장소를 연결하고 위 환경 변수(마이그레이션 전용 값 제외)를 설정합니다. `vercel.json` 은 설치 명령을 `npm ci --ignore-scripts` 로 고정합니다(lock 파일 그대로, 설치 스크립트 실행 안 함). OAuth 콜백 주소:
`<AUTH_URL>/api/auth/callback/google`, `<AUTH_URL>/api/auth/callback/kakao`.

구조 설명: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
