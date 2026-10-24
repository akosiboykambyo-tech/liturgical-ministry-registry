-- ISOLATED STAGING ONLY. Self-check reveals only the caller's own active role.
BEGIN;
CREATE OR REPLACE FUNCTION public.registration_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS(
 SELECT 1 FROM registry_private.registration_administrators a
 WHERE a.user_id = (SELECT auth.uid()) AND a.active AND a.revoked_at IS NULL
 );
$fn$;
REVOKE ALL ON FUNCTION public.registration_is_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registration_is_admin() TO authenticated;
COMMIT;