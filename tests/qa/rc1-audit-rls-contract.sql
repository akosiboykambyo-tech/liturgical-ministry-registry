-- Run AFTER the exact review-only candidate SQL has executed.
-- Role/JWT claims here are synthetic PostgreSQL session settings; this is
-- a policy + invoker-trigger contract test, NOT full real Auth acceptance.
\set ON_ERROR_STOP on

DO $verify$
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='audit_logs'
        AND policyname IN ('rc1_registry_admin_audit_select',
                           'rc1_registry_admin_audit_insert')) <> 2
    OR (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='audit_logs') <> 2
  THEN
    RAISE EXCEPTION 'Audit RLS: unexpected policy structure';
  END IF;
  IF has_table_privilege('authenticated','public.audit_logs','UPDATE')
    OR has_table_privilege('authenticated','public.audit_logs','DELETE')
    OR NOT has_table_privilege('authenticated','public.audit_logs','SELECT')
    OR NOT has_table_privilege('authenticated','public.audit_logs','INSERT')
  THEN
    RAISE EXCEPTION 'Audit RLS: grants do not match intended read/append-only model';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs) <> 1 THEN
    RAISE EXCEPTION 'Audit RLS: baseline audit history changed';
  END IF;
END
$verify$;

-- Positive active administrator, including the invoker audit trigger.
BEGIN;
SET LOCAL ROLE qa_registry_admin;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $verify$
BEGIN
  IF NOT public.registration_is_admin() THEN
    RAISE EXCEPTION 'Synthetic active Registry admin unexpectedly denied';
  END IF;
END
$verify$;
INSERT INTO public.members(id,display_name)
VALUES ('10000000-0000-0000-0000-000000000001','Synthetic Admin Fixture');
DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.audit_logs) <> 2 THEN
    RAISE EXCEPTION 'SECURITY INVOKER member audit trigger incompatible';
  END IF;
END
$verify$;
SELECT qa_test.expect_denied('UPDATE public.audit_logs SET action=''tampered'' WHERE id=1');
SELECT qa_test.expect_denied('DELETE FROM public.audit_logs WHERE id=1');
ROLLBACK;

-- Ordinary nonadmin: audit not visible, audit INSERT and direct member
-- INSERT with SECURITY INVOKER audit trigger must both reject atomically.
BEGIN;
SET LOCAL ROLE qa_ordinary;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $verify$
BEGIN
  IF public.registration_is_admin() OR (SELECT count(*) FROM public.audit_logs) <> 0 THEN
    RAISE EXCEPTION 'Nonadmin could see audit history or pass admin guard';
  END IF;
END
$verify$;
SELECT qa_test.expect_denied('INSERT INTO public.audit_logs(action) VALUES (''forged'')');
SELECT qa_test.expect_denied('INSERT INTO public.members(id,display_name) VALUES (''10000000-0000-0000-0000-000000000002'',''Synthetic Nonadmin'')');
ROLLBACK;

-- A previously authorized identity must lose access when revoked.
BEGIN;
SET LOCAL ROLE qa_revoked;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
DO $verify$
BEGIN
  IF public.registration_is_admin() OR (SELECT count(*) FROM public.audit_logs) <> 0 THEN
    RAISE EXCEPTION 'Revoked admin could read audit history or pass admin guard';
  END IF;
END
$verify$;
SELECT qa_test.expect_denied('INSERT INTO public.audit_logs(action) VALUES (''revoked_forgery'')');
ROLLBACK;

-- COWL/Curia are represented as *non-Registry-admin* synthetic roles only.
-- Their actual finance access and signed JWT sessions require separate E2E.
BEGIN;
SET LOCAL ROLE qa_cowl;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
DO $verify$
BEGIN
  IF public.registration_is_admin() OR (SELECT count(*) FROM public.audit_logs) <> 0 THEN
    RAISE EXCEPTION 'Synthetic COWL non-Registry role could access audit';
  END IF;
END
$verify$;
SELECT qa_test.expect_denied('INSERT INTO public.audit_logs(action) VALUES (''cowl_forgery'')');
ROLLBACK;

BEGIN;
SET LOCAL ROLE qa_curia;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
DO $verify$
BEGIN
  IF public.registration_is_admin() OR (SELECT count(*) FROM public.audit_logs) <> 0 THEN
    RAISE EXCEPTION 'Synthetic Curia non-Registry role could access audit';
  END IF;
END
$verify$;
SELECT qa_test.expect_denied('INSERT INTO public.audit_logs(action) VALUES (''curia_forgery'')');
ROLLBACK;

BEGIN;
SET LOCAL ROLE anon;
SELECT qa_test.expect_denied('SELECT count(*) FROM public.audit_logs');
SELECT qa_test.expect_denied('INSERT INTO public.audit_logs(action) VALUES (''anon_forgery'')');
ROLLBACK;

-- All attempted writes were in rollback transactions. The production-like
-- fixture's history/records must be untouched.
DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.audit_logs) <> 1
    OR (SELECT count(*) FROM public.members) <> 0
  THEN
    RAISE EXCEPTION 'Synthetic baseline changed after acceptance tests';
  END IF;
END
$verify$;
\echo PASS: exact RC1 audit SQL policy, role denial, member trigger, no-persistent-write contract
