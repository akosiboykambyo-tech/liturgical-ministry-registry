-- Synthetic-only representative fixture for the RC1 audit-RLS candidate.
-- This is NOT a Production schema backup or a full Supabase/Auth test.
-- Use only in an isolated, disposable PostgreSQL database.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE qa_registry_admin NOLOGIN IN ROLE authenticated;
CREATE ROLE qa_ordinary NOLOGIN IN ROLE authenticated;
CREATE ROLE qa_revoked NOLOGIN IN ROLE authenticated;
CREATE ROLE qa_cowl NOLOGIN IN ROLE authenticated;
CREATE ROLE qa_curia NOLOGIN IN ROLE authenticated;

CREATE SCHEMA auth;
CREATE SCHEMA registry_private;
CREATE SCHEMA qa_test;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA qa_test TO anon, authenticated;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC;

-- Synthetic claims only. NO GoTrue/Auth API or real JWT is used.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $fn$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $fn$ SELECT jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $fn$;

CREATE TABLE registry_private.registration_administrators (
  user_id uuid PRIMARY KEY,
  active boolean NOT NULL,
  revoked_at timestamptz
);
INSERT INTO registry_private.registration_administrators(user_id,active,revoked_at) VALUES
  ('00000000-0000-0000-0000-000000000001',true,NULL),
  ('00000000-0000-0000-0000-000000000003',false,now());

-- Matches the active-admin guard's relevant shape; authorization still belongs
-- to live signed-session testing in a separate production-shaped environment.
CREATE FUNCTION public.registration_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM registry_private.registration_administrators a
    WHERE a.user_id = (SELECT auth.uid()) AND a.active AND a.revoked_at IS NULL
  );
$fn$;
REVOKE ALL ON FUNCTION public.registration_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_is_admin() TO authenticated;

CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL,
  actor uuid
);
INSERT INTO public.audit_logs(action,actor) VALUES ('baseline',NULL);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Representative legacy policy names/commands from read-only Production
-- inspection. The address here is synthetic, not the live allowlisted address.
CREATE POLICY "Allow admin log management" ON public.audit_logs
FOR ALL TO authenticated
USING ((auth.jwt()->>'email') = 'synthetic@example.invalid')
WITH CHECK ((auth.jwt()->>'email') = 'synthetic@example.invalid');
CREATE POLICY "admin_full_access_audit_logs" ON public.audit_logs
FOR ALL TO authenticated
USING ((auth.jwt()->>'email') = 'synthetic@example.invalid')
WITH CHECK ((auth.jwt()->>'email') = 'synthetic@example.invalid');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;

-- The real Production members audit trigger is SECURITY INVOKER. Keeping
-- this property is essential to catch a migration that breaks member writes.
CREATE TABLE public.members (id uuid PRIMARY KEY, display_name text NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
CREATE FUNCTION public.log_member_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $fn$
BEGIN
  INSERT INTO public.audit_logs(action,actor) VALUES (TG_OP,auth.uid());
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER trg_log_member_changes
AFTER INSERT OR UPDATE OR DELETE ON public.members FOR EACH ROW
EXECUTE FUNCTION public.log_member_changes();

-- Test-only utility remains SECURITY INVOKER and must be called with a
-- literal test SQL string; it never runs as elevated privileges.
CREATE FUNCTION qa_test.expect_denied(statement text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $fn$
DECLARE did_fail boolean := false;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    did_fail := true;
  END;
  IF NOT did_fail THEN
    RAISE EXCEPTION 'Unexpectedly authorized statement';
  END IF;
END;
$fn$;
GRANT EXECUTE ON FUNCTION qa_test.expect_denied(text) TO anon, authenticated;
