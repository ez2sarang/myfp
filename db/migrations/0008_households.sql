-- myfp 0008: 함께 보기(그룹 합산). 상대의 명시적 동의(초대 수락)로만 그룹에 들어가고, 각자 내놓을 범위를 고른다.
--  - 한 사람은 한 그룹에만(household_members.user_id 유일), 그룹당 방장 1명(부분 유일 인덱스), 그룹 안 태그 유일.
--  - 그룹당 최대 6명은 앱이 그룹 행을 잠근 뒤 센다(동시 수락 경쟁 방지).
--  - 초대는 단회용: 토큰 원문은 저장하지 않고 SHA-256(16진수 64자)만, 사용하면 used_at·used_by 를 채운다.
--  - 항목별 '나만 보기'(private)는 그룹 합산에서 빠진다.
-- 모든 객체는 myfp 스키마로 명시한다. 여러 번 적용해도 같다.
CREATE TABLE IF NOT EXISTS myfp.households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  created_by uuid REFERENCES myfp.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS myfp.household_members (
  household_id   uuid NOT NULL REFERENCES myfp.households (id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('owner', 'member')),
  tag            text NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 12),
  share_fixed    boolean NOT NULL DEFAULT true,
  share_balances boolean NOT NULL DEFAULT false,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id),
  CONSTRAINT household_members_user_key UNIQUE (user_id),
  CONSTRAINT household_members_tag_key UNIQUE (household_id, tag)
);
CREATE UNIQUE INDEX IF NOT EXISTS household_members_one_owner ON myfp.household_members (household_id) WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS myfp.household_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES myfp.households (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by   uuid REFERENCES myfp.users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  used_by      uuid REFERENCES myfp.users (id) ON DELETE SET NULL,
  CONSTRAINT household_invites_used_chk CHECK (used_by IS NULL OR used_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS household_invites_household_idx ON myfp.household_invites (household_id, created_at DESC);

ALTER TABLE myfp.fixed_expenses ADD COLUMN IF NOT EXISTS private boolean NOT NULL DEFAULT false;
ALTER TABLE myfp.balance_items ADD COLUMN IF NOT EXISTS private boolean NOT NULL DEFAULT false;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myfp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON myfp.households, myfp.household_members, myfp.household_invites TO myfp_app;
  END IF;
END
$grants$;
