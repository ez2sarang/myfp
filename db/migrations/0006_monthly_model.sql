-- myfp 0006: 월 단위 모델. 고정지출의 달별 덮어쓰기(이번 달만 금액 변경·건너뛰기)와 예정·일회성 지출(할부·분납 포함).
-- 모든 객체는 myfp 스키마로 명시한다. 여러 번 적용해도 같다(IF NOT EXISTS·제약 존재 확인).
-- 금액은 원 단위 정수(bigint), 월은 'YYYY-MM' 문자열.

-- 덮어쓰기가 다른 사용자의 고정지출에 붙지 못하게 (고정지출 id, 소유자) 쌍을 외래 키로 건다.
DO $fixed_owner$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fixed_expenses_id_user_key' AND conrelid = 'myfp.fixed_expenses'::regclass
  ) THEN
    ALTER TABLE myfp.fixed_expenses ADD CONSTRAINT fixed_expenses_id_user_key UNIQUE (id, user_id);
  END IF;
END
$fixed_owner$;

CREATE TABLE IF NOT EXISTS myfp.fixed_overrides (
  user_id          uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  fixed_expense_id uuid NOT NULL,
  month            text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount           bigint CHECK (amount IS NULL OR amount BETWEEN 0 AND 1000000000000),
  skipped          boolean NOT NULL DEFAULT false,
  note             text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_overrides_key UNIQUE (fixed_expense_id, month),
  CONSTRAINT fixed_overrides_owner_fk FOREIGN KEY (fixed_expense_id, user_id) REFERENCES myfp.fixed_expenses (id, user_id) ON DELETE CASCADE,
  -- 아무것도 바꾸지 않는 덮어쓰기는 저장하지 않는다
  CONSTRAINT fixed_overrides_effect_chk CHECK (skipped OR amount IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fixed_overrides_user_idx ON myfp.fixed_overrides (user_id, month);

CREATE TABLE IF NOT EXISTS myfp.planned_expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  due_date   date NOT NULL,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  category   text NOT NULL CHECK (category IN ('housing', 'loan', 'loan_interest', 'insurance', 'telecom', 'subscription', 'transport', 'education', 'tax', 'utilities', 'other')),
  amount     bigint NOT NULL CHECK (amount BETWEEN 0 AND 1000000000000),
  status     text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'paid', 'skipped')),
  note       text CHECK (note IS NULL OR char_length(note) <= 200),
  -- N개월 분할로 함께 만든 묶음: 묶음 id·회차·전체 회차 (셋 다 있거나 셋 다 없다)
  group_id   uuid,
  seq        integer CHECK (seq IS NULL OR seq BETWEEN 1 AND 36),
  total      integer CHECK (total IS NULL OR total BETWEEN 2 AND 36),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planned_expenses_group_chk CHECK (
    (group_id IS NULL AND seq IS NULL AND total IS NULL) OR (group_id IS NOT NULL AND seq IS NOT NULL AND total IS NOT NULL AND seq <= total)
  )
);
CREATE INDEX IF NOT EXISTS planned_expenses_user_due_idx ON myfp.planned_expenses (user_id, due_date);
CREATE INDEX IF NOT EXISTS planned_expenses_group_idx ON myfp.planned_expenses (user_id, group_id) WHERE group_id IS NOT NULL;

-- 앱 역할(myfp_app)이 있을 때만: 사용자가 만들고 지우는 데이터라 네 권한 모두 필요하다.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myfp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON myfp.fixed_overrides, myfp.planned_expenses TO myfp_app;
  END IF;
END
$grants$;
