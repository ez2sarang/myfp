-- myfp 0005: 사용자가 직접 정하는 표시 이름(선택). 본인 설정 화면과 관리자 화면에서만 보인다(공유 보기·다른 사용자에게는 내보내지 않는다).
-- 저장은 앞뒤 공백을 지운 문자열 그대로이고, 길이는 문자(code point) 수 1~30. 여러 번 적용해도 같다.
-- 사용자 행에 붙은 열이라 계정 삭제(사용자 행 삭제) 때 함께 지워진다.
ALTER TABLE myfp.users ADD COLUMN IF NOT EXISTS display_name text;

DO $display_name$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_display_name_chk' AND conrelid = 'myfp.users'::regclass
  ) THEN
    ALTER TABLE myfp.users ADD CONSTRAINT users_display_name_chk CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 30);
  END IF;
END
$display_name$;
