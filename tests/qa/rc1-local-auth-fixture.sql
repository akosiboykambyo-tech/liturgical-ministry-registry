-- Synthetic-only registration guard for local GoTrue/PostgREST integration.
-- No Production, TEST or actual staff records; NOT full Production schema.
\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS registry_private.registration_administrators (
 user_id uuid PRIMARY KEY, active boolean NOT NULL DEFAULT false, revoked_at timestamptz
);
CREATE OR REPLACE FUNCTION public.registration_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $guard$
 SELECT EXISTS(
  SELECT 1 FROM registry_private.registration_administrators a
  WHERE a.user_id = (SELECT auth.uid()) AND a.active AND a.revoked_at IS NULL
 );
$guard$;
REVOKE ALL ON FUNCTION public.registration_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registration_is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.registration_is_admin() TO authenticated;
NOTIFY pgrst, 'reload schema';
