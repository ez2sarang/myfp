-- myfp 0004 (2026-10-12 운영 DB 에 적용됨 — 소유자 연결): 앱 역할(myfp_app) 권한을 실제 동작에 맞춘다. 역할이 있을 때만, 여러 번 적용해도 같다.
--  - 계정 자기 삭제: users·accounts 의 DELETE 가 필요하다.
--  - 감사 기록은 추가·조회만: audit_log 의 UPDATE·DELETE·TRUNCATE 를 회수한다(처리방침 "앱에는 감사 기록 삭제 권한이 없다"와 일치).
--  - 마이그레이션 이력은 앱이 쓰지도 읽지도 않는다(마이그레이션은 소유자 역할이 실행): schema_migrations 의 모든 권한 회수.
DO $privileges$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myfp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON myfp.users, myfp.accounts TO myfp_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON myfp.audit_log FROM myfp_app;
    GRANT SELECT, INSERT ON myfp.audit_log TO myfp_app;
    REVOKE ALL ON myfp.schema_migrations FROM myfp_app;
  END IF;
END
$privileges$;
