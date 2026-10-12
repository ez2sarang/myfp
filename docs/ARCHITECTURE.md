# myfp 구조

## 요청 흐름

```mermaid
flowchart LR
  B[브라우저] --> P[src/proxy.ts<br/>세션 쿠키 확인]
  P -->|공개 경로| PUB["/, /login, /privacy, /terms, /s/토큰, /api/health"]
  P -->|보호 경로| G[페이지·서버 액션·라우트<br/>requireActiveUser / requireAdmin]
  G --> Q[src/lib/db/queries<br/>WHERE user_id = 세션 사용자]
  Q --> DB[(PostgreSQL 스키마 myfp)]
  PUB -->|/s/토큰| R[share/resolve.ts<br/>해시 조회·만료·폐기 판정]
  R --> V[share/view.ts<br/>섹션 선택·가림 적용]
```

## 디렉터리

| 경로 | 내용 |
|------|------|
| `src/app/(marketing)` | 공개 소개·약관 페이지 (디자인 단계는 이 폴더와 `src/components/marketing` 만 다룬다) |
| `src/app/app` | 로그인 후 화면 (`/app/*`) |
| `src/app/admin` | 관리자 화면 |
| `src/app/s/[token]` | 비로그인 공유 보기 (읽기 전용) |
| `src/lib/auth-core` | 인증 관련 순수 로직 (경로 분류, callbackUrl 정리, 가입·연결 정책, 관문 판정) |
| `src/lib/finance` | 재무 순수 로직 (날짜·일정·검증·요약·CSV·시드 정규화) — 모두 Asia/Seoul 달력 날짜 |
| `src/lib/share` | 공유 토큰·설정·보기 데이터 |
| `src/lib/db` | 연결 풀과 쿼리 계층 (Db 인터페이스 주입 → 가짜 Db 로 시험) |
| `src/lib/actions` | 서버 액션 (`assertSameOrigin` → 세션 가드 → 검증 → 트랜잭션) |
| `src/lib/session.ts` | 신뢰 경계: 세션 → DB 사용자 → 상태·역할 판정 |
| `scripts` | 마이그레이션, 비밀번호 해시, 개인 데이터 적재, 공개 저장소 검사 |
| `tests` | `node --test` 시험 (DB 없음) |

## 데이터 모델

| 테이블 | 핵심 열 |
|--------|---------|
| `users` | email(신뢰 이메일만, 고유), name, image, status(pending·active·blocked), role(admin·member) |
| `accounts` | (provider, provider_account_id) → user_id |
| `fixed_expenses` | user_id, name, category, amount(bigint), cycle, billing_day(1–31, 31=말일), billing_month, payment_method, institution, start/end_date, active, note, source, archived_at, external_key |
| `balance_items` | user_id, kind(asset·liability), category, name, amount, as_of, note, monthly_payment, interest_rate, end_date, external_key |
| `balance_snapshots` | user_id, month(YYYY-MM), assets_total, liabilities_total — 자산·부채 변경 시 그 달 행 upsert (순자산 추이) |
| `share_links` | user_id, label, token_hash(SHA-256), scopes, masks, expires_at, revoked_at, view_count, last_viewed_at |
| `audit_log` | actor, action, target, before/after (추가 전용) |

## 차트

데이터 가공은 서버의 `src/lib/finance/charts.ts`·`projection.ts`(순수 함수)가 하고, `src/components/charts/*-chart.tsx`(use client)는 숫자만 받아 그린다.
공유 보기에서 금액을 숨기면 같은 함수의 비중(%) 변환 결과만 직렬화한다. 각 차트 옆(또는 「표로 보기」)에 같은 데이터를 목록·표로 둔다.

## 디자인 토큰

색·간격·반경·타이포는 `src/app/globals.css` 의 CSS 변수와 Tailwind 4 `@theme inline` 에 있다. 값만 바꾸면 전체 룩이 바뀐다. 차트 색은 `--chart-1`…`--chart-11`, `--chart-asset`, `--chart-liability`, `--chart-grid`, `--chart-axis`.
