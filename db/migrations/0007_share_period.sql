-- myfp 0007: 공유 링크의 기간. 생성 뒤에는 바꾸지 않는다(새 링크를 만든다).
--  current : 열람 시점의 이번 달(기본값 — 이 열이 생기기 전의 링크도 그대로 이 뜻이 된다)
--  month   : 특정 달 하나 (period_start = period_end)
--  range   : 시작 달 ~ 끝 달 (최대 12개월은 앱이 검사하고, 읽을 때도 다시 검사한다)
-- 달은 'YYYY-MM'. 여러 번 적용해도 같다.
ALTER TABLE myfp.share_links ADD COLUMN IF NOT EXISTS period_mode text NOT NULL DEFAULT 'current';
ALTER TABLE myfp.share_links ADD COLUMN IF NOT EXISTS period_start text;
ALTER TABLE myfp.share_links ADD COLUMN IF NOT EXISTS period_end text;

DO $period$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'share_links_period_chk' AND conrelid = 'myfp.share_links'::regclass
  ) THEN
    ALTER TABLE myfp.share_links ADD CONSTRAINT share_links_period_chk CHECK (
      (period_mode = 'current' AND period_start IS NULL AND period_end IS NULL)
      OR (period_mode = 'month' AND period_start ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND period_end = period_start)
      OR (period_mode = 'range' AND period_start ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND period_end ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND period_start <= period_end)
    );
  END IF;
END
$period$;
