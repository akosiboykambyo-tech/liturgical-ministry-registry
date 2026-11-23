-- RC1 security closure candidate: audit_logs active-admin authorization.
-- PROPOSAL ONLY. DO NOT APPLY TO PRODUCTION WITHOUT BACKUP + TEST + OWNER GO.
-- Verified PROD on 2026-11-20: two permissive legacy ALL policies keyed to
-- a single JWT email. TEST: SELECT policy keyed to registration_is_admin().
-- No audit rows are changed.
--
-- Critical integration behavior:
-- - app/admin/audit/page.tsx reads audit_logs via authenticated browser client.
-- - public.log_member_changes() is SECURITY INVOKER, so admin direct CRUD may
--   require INSERT privileges/policy for the audit trigger.
-- - public.log_member_ministry_changes() is SECURITY DEFINER.
-- This candidate deliberately preserves admin INSERT for direct-write compatibility
-- but denies browser UPDATE/DELETE; later move writes behind a trusted server
-- boundary to prevent even authorized admins from fabricating audit entries.
-- Review with actual signed Registry-admin and revoked/nonadmin JWTs in TEST.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL
     OR to_regprocedure('public.registration_is_admin()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_class WHERE oid='public.audit_logs'::regclass
       AND relrowsecurity
     )
  THEN
    RAISE EXCEPTION 'Audit hardening: expected RLS and admin guard absent';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='audit_logs') <> 2
     OR EXISTS (
       SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='audit_logs'
       AND policyname NOT IN (
         'Allow admin log management','admin_full_access_audit_logs'
       )
     )
  THEN
    RAISE EXCEPTION 'Audit hardening: policy drift; stop and review';
  END IF;
END
$preflight$;

DROP POLICY "Allow admin log management" ON public.audit_logs;
DROP POLICY "admin_full_access_audit_logs" ON public.audit_logs;

CREATE POLICY rc1_registry_admin_audit_select
ON public.audit_logs FOR SELECT TO authenticated
USING ((SELECT public.registration_is_admin()));

CREATE POLICY rc1_registry_admin_audit_insert
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK ((SELECT public.registration_is_admin()));

-- TABLE grants must also be narrowed. Authenticated admins may read and insert,
-- but no longer modify or erase existing audit history over the Data API.
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated;

DO $postflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='audit_logs'
      AND (cmd IN ('UPDATE','DELETE','ALL')
       OR qual ILIKE '%email%' OR with_check ILIKE '%email%'))
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='audit_logs') <> 2
  THEN
    RAISE EXCEPTION 'Audit hardening: expected restrictive policies not installed';
  END IF;
END
$postflight$;
COMMIT;

-- TEST gate: Registry admin can view audit rows and create a disposable member
-- with an audit event; revoked/COWL/Curia/anon cannot list audit logs; admins
-- cannot UPDATE/DELETE audit rows. Restore TEST fixture under approved protocol.
-- PROD gate: independent encrypted database + Storage backup and restore proof.
