import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthProviderId, isBootstrapAdmin, normalizeEmail, parseAdminEmails } from "../src/lib/auth-core/admin-emails.ts";

const LIST = "Admin@Example.com, second@example.com ,,  ";

test("ADMIN_EMAILS 파싱: 쉼표 구분, 공백·대소문자 정규화, 빈 항목·형식 오류·중복 제거", () => {
  assert.deepEqual(parseAdminEmails(LIST), ["admin@example.com", "second@example.com"]);
  assert.deepEqual(parseAdminEmails("a@x.com,A@X.COM"), ["a@x.com"]); // scan-public: allow (가짜 시험 값)
  assert.deepEqual(parseAdminEmails("not-an-email, ,@x.com,a@, a b@x.com"), []); // scan-public: allow (가짜 시험 값)
  assert.deepEqual(parseAdminEmails(undefined), []);
  assert.deepEqual(parseAdminEmails(""), []);
});

test("이메일 정규화", () => {
  assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com"); // scan-public: allow (가짜 시험 값)
  assert.equal(normalizeEmail("a@b@c"), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(42), null);
  assert.equal(normalizeEmail(`${"a".repeat(250)}@x.com`), null);
});

test("Google(검증된 이메일) 과 credentials 만 관리자 후보, 대소문자·공백 무관", () => {
  assert.equal(isBootstrapAdmin({ email: "admin@example.com", provider: "google", adminEmailsRaw: LIST }), true);
  assert.equal(isBootstrapAdmin({ email: "  ADMIN@EXAMPLE.COM ", provider: "google", adminEmailsRaw: LIST }), true);
  assert.equal(isBootstrapAdmin({ email: "second@example.com", provider: "credentials", adminEmailsRaw: LIST }), true);
});

test("Kakao 는 이메일이 같아도 관리자가 될 수 없고, 이메일이 없으면 어떤 공급자도 불가", () => {
  assert.equal(isBootstrapAdmin({ email: "admin@example.com", provider: "kakao", adminEmailsRaw: LIST }), false);
  assert.equal(isBootstrapAdmin({ email: null, provider: "kakao", adminEmailsRaw: LIST }), false);
  assert.equal(isBootstrapAdmin({ email: null, provider: "google", adminEmailsRaw: LIST }), false);
  assert.equal(isBootstrapAdmin({ email: undefined, provider: "credentials", adminEmailsRaw: LIST }), false);
  assert.equal(isBootstrapAdmin({ email: "", provider: "google", adminEmailsRaw: LIST }), false);
});

test("목록에 없거나 비어 있거나 알 수 없는 공급자면 거부", () => {
  assert.equal(isBootstrapAdmin({ email: "other@example.com", provider: "google", adminEmailsRaw: LIST }), false);
  assert.equal(isBootstrapAdmin({ email: "admin@example.com", provider: "google", adminEmailsRaw: "" }), false);
  assert.equal(isBootstrapAdmin({ email: "admin@example.com", provider: "google", adminEmailsRaw: undefined }), false);
  assert.equal(isBootstrapAdmin({ email: "admin@example.com", provider: "github", adminEmailsRaw: LIST }), false);
  assert.equal(isBootstrapAdmin({ email: "admin@example.com.evil.com", provider: "google", adminEmailsRaw: LIST }), false); // scan-public: allow (가짜 시험 값)
  assert.equal(isBootstrapAdmin({ email: "xadmin@example.com", provider: "google", adminEmailsRaw: LIST }), false);
});

test("공급자 식별자 검사", () => {
  assert.equal(isAuthProviderId("google"), true);
  assert.equal(isAuthProviderId("kakao"), true);
  assert.equal(isAuthProviderId("credentials"), true);
  assert.equal(isAuthProviderId("github"), false);
  assert.equal(isAuthProviderId(undefined), false);
});
