-- myfp 0003 (향후 확장 대비, 2026-10-12 운영 DB 에 적용됨 — 소유자 연결): 공유 링크의 열람 대상 구분.
--  members    : myfp 에 로그인한 사용자(blocked 제외) 누구나 — 지금 동작
--  designated : (향후) 링크마다 지정한 회원만. 아직 구현하지 않았고, 앱은 이 값을 만나면 열람을 거부한다.
ALTER TABLE myfp.share_links ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'members';

DO $audience$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'share_links_audience_chk' AND conrelid = 'myfp.share_links'::regclass
  ) THEN
    ALTER TABLE myfp.share_links ADD CONSTRAINT share_links_audience_chk CHECK (audience IN ('members', 'designated'));
  END IF;
END
$audience$;
