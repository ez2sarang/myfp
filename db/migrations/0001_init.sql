-- myfp 0001: 사용자·로그인 수단·고정지출·자산/부채·공유 링크·감사 기록.
-- 모든 객체는 스키마 myfp 로 명시한다. 여러 번 적용해도 안전하도록 IF NOT EXISTS 만 쓴다.
-- 금액은 원(KRW) 단위 정수(bigint). 부동소수를 쓰지 않는다.
-- 스키마 myfp 자체는 실행기(scripts/migrate.mjs 의 ensureSchema)가 없을 때만 만든다 (이미 있으면 DB 의 CREATE 권한이 없어도 통과).

CREATE TABLE IF NOT EXISTS myfp.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text,
  name          text,
  image         text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'blocked')),
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
-- 신뢰할 수 있는 이메일(Google 검증 이메일, 관리자 이메일)만 저장되며 한 사용자에만 속한다.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON myfp.users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_status_idx ON myfp.users (status);

-- 로그인 수단: (공급자, 공급자 계정 id) 하나가 사용자 하나에 연결된다. OAuth 토큰은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS myfp.accounts (
  provider            text NOT NULL CHECK (provider IN ('google', 'kakao', 'credentials')),
  provider_account_id text NOT NULL,
  user_id             uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON myfp.accounts (user_id);

CREATE TABLE IF NOT EXISTS myfp.fixed_expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  external_key   text CHECK (external_key IS NULL OR length(external_key) BETWEEN 1 AND 80),
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  category       text NOT NULL CHECK (category IN ('housing', 'loan', 'loan_interest', 'insurance', 'telecom', 'subscription', 'transport', 'education', 'tax', 'utilities', 'other')),
  amount         bigint NOT NULL CHECK (amount BETWEEN 0 AND 1000000000000),
  cycle          text NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly', 'yearly')),
  billing_day    smallint CHECK (billing_day BETWEEN 1 AND 31),
  billing_month  smallint CHECK (billing_month BETWEEN 1 AND 12),
  payment_method text CHECK (payment_method IN ('bank_autopay', 'card', 'other')),
  institution    text CHECK (institution IS NULL OR length(institution) <= 100),
  start_date     date,
  end_date       date,
  active         boolean NOT NULL DEFAULT true,
  note           text CHECK (note IS NULL OR length(note) <= 500),
  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'card_analysis', 'user')),
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_expenses_dates_chk CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT fixed_expenses_yearly_chk CHECK (cycle = 'monthly' OR billing_day IS NULL OR billing_month IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fixed_expenses_user_idx ON myfp.fixed_expenses (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS fixed_expenses_external_key ON myfp.fixed_expenses (user_id, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS myfp.balance_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  external_key    text CHECK (external_key IS NULL OR length(external_key) BETWEEN 1 AND 80),
  kind            text NOT NULL CHECK (kind IN ('asset', 'liability')),
  category        text NOT NULL,
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  amount          bigint NOT NULL CHECK (amount BETWEEN 0 AND 1000000000000),
  as_of           date,
  note            text CHECK (note IS NULL OR length(note) <= 500),
  monthly_payment bigint CHECK (monthly_payment IS NULL OR monthly_payment BETWEEN 0 AND 1000000000000),
  interest_rate   numeric(6, 3) CHECK (interest_rate IS NULL OR interest_rate BETWEEN 0 AND 100),
  end_date        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balance_items_category_chk CHECK (
    (kind = 'asset' AND category IN ('cash', 'deposit', 'investment', 'real_estate', 'other'))
    OR (kind = 'liability' AND category IN ('loan', 'card', 'other'))
  ),
  CONSTRAINT balance_items_liability_fields_chk CHECK (kind = 'liability' OR (monthly_payment IS NULL AND interest_rate IS NULL AND end_date IS NULL))
);
CREATE INDEX IF NOT EXISTS balance_items_user_idx ON myfp.balance_items (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS balance_items_external_key ON myfp.balance_items (user_id, external_key) WHERE external_key IS NOT NULL;

-- 공유 링크: 토큰 원문은 저장하지 않고 SHA-256 해시(16진수 64자)만 둔다.
CREATE TABLE IF NOT EXISTS myfp.share_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  label          text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  token_hash     text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scopes         jsonb NOT NULL,
  masks          jsonb NOT NULL,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  view_count     integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS share_links_user_idx ON myfp.share_links (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS myfp.audit_log (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES myfp.users (id) ON DELETE SET NULL,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_key    text NOT NULL,
  before        jsonb,
  after         jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON myfp.audit_log (at DESC);

-- 앱 역할(myfp_app)이 있으면 필요한 권한만 부여한다. 역할 자체는 인프라 쪽에서 만든다(없으면 이 블록은 아무것도 하지 않는다).
--  - 사용자 데이터(고정지출·자산/부채·공유 링크)는 사용자의 삭제 요청을 처리하려고 DELETE 를 허용한다.
--  - 감사 기록은 추가·조회만 (UPDATE·DELETE 없음). 사용자·로그인 수단은 DELETE 없음.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myfp_app') THEN
    GRANT USAGE ON SCHEMA myfp TO myfp_app;
    GRANT SELECT, INSERT, UPDATE ON myfp.users, myfp.accounts TO myfp_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON myfp.fixed_expenses, myfp.balance_items, myfp.share_links TO myfp_app;
    GRANT SELECT, INSERT ON myfp.audit_log TO myfp_app;
    GRANT USAGE, SELECT ON SEQUENCE myfp.audit_log_id_seq TO myfp_app;
  END IF;
END
$grants$;
