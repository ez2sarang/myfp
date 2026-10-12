-- myfp 0002: 월별 순자산 스냅샷. 자산·부채를 추가·수정·삭제할 때마다 그 달(서울 기준) 행을 갱신한다(항목 상세는 저장하지 않는다).
CREATE TABLE IF NOT EXISTS myfp.balance_snapshots (
  user_id           uuid NOT NULL REFERENCES myfp.users (id) ON DELETE CASCADE,
  month             text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  assets_total      bigint NOT NULL CHECK (assets_total >= 0),
  liabilities_total bigint NOT NULL CHECK (liabilities_total >= 0),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myfp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON myfp.balance_snapshots TO myfp_app;
  END IF;
END
$grants$;
