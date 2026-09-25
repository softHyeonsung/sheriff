-- supabase/migrations/20260925000001_users_terms.sql
-- kakao_id: 계정을 만들기 전에 약관 동의 여부를 조회하는 직접 키(합성 이메일 대신).
-- terms_version: 동의한 약관 버전 — 약관 개정 시 재동의 대상 판별용.
-- 쓰기는 service role(kakao-custom-token)만. authenticated의 update는 기존대로 home_address만.
alter table public.users
  add column kakao_id bigint unique,
  add column terms_version text;
