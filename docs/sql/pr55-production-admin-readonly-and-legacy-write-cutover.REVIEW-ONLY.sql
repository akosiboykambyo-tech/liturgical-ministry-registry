-- PR55 SECURITY PHASE 2: REVIEW ONLY, deliberately NONEXECUTABLE.
-- Requires phase-1 foundation, verified approved Auth grant, transactionally
-- installed hardened renewal RPC and verified feature migration cutover.
BEGIN;
DO $stop$ BEGIN
 RAISE EXCEPTION 'PR55 NO-GO: coordinated production ACL and frontend cutover not authorized';
END $stop$;
-- STOP - all remaining SQL is unreachable.

DO $guard$
DECLARE n integer;
BEGIN
 IF to_regclass('registry_private.registration_administrators') IS NULL
 OR to_regclass('public.recommendation_renewal_batches') IS NULL
 OR to_regclass('public.recommendation_renewal_memberships') IS NULL
 OR to_regprocedure('public.process_recommendation_renewal_batch(uuid,text,text,text,date,date,uuid[],text)') IS NULL
 OR to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NULL
 OR to_regprocedure('public.registry_attach_ministry_letter_v1(uuid,uuid,text)') IS NULL
 THEN
  RAISE EXCEPTION 'Production admin/renewal RPC dependencies missing' USING ERRCODE='42501';
 END IF;

 SELECT count(*) INTO n FROM registry_private.registration_administrators a
 JOIN auth.users u ON u.id=a.user_id
 WHERE a.active AND a.revoked_at IS NULL;
 IF n<>1 THEN
  RAISE EXCEPTION 'Require exactly one audited active admin grant at cutover'
   USING ERRCODE='42501';
 END IF;

 -- Refuse cutting off legacy writes until production batch renewal has the
 -- new revocable admin check and rejects arbitrary next-renewal dates.
 IF position('p_next_renewal_date IS DISTINCT FROM v_expires'
    IN pg_get_functiondef(
      'public.process_recommendation_renewal_batch(uuid,text,text,text,date,date,uuid[],text)'::regprocedure
    )) = 0
 THEN RAISE EXCEPTION 'Hardened renewal RPC not yet installed' USING ERRCODE='42501';
 END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.registration_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS (
  SELECT 1 FROM registry_private.registration_administrators a
  WHERE a.user_id=(SELECT auth.uid())
    AND a.active AND a.revoked_at IS NULL
 );
$fn$;
REVOKE ALL ON FUNCTION public.registration_is_admin() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registration_is_admin() TO authenticated;

-- Replace fixed-UUID ALL policies. No authenticated direct INSERT/UPDATE/
-- DELETE rights survive cutover, including the old member/ministry editor.
DROP POLICY IF EXISTS registry_admin_members ON public.members;
DROP POLICY IF EXISTS registry_admin_member_ministries ON public.member_ministries;
DROP POLICY IF EXISTS pr55_admin_read_members ON public.members;
DROP POLICY IF EXISTS pr55_admin_read_member_ministries ON public.member_ministries;

CREATE POLICY pr55_admin_read_members ON public.members
 FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
CREATE POLICY pr55_admin_read_member_ministries ON public.member_ministries
 FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));

-- Explicit grant removal is essential; RLS alone is not the full boundary.
REVOKE ALL ON public.members,public.member_ministries
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.members,public.member_ministries TO authenticated;

DROP POLICY IF EXISTS authenticated_select_recommendation_renewal_batches
 ON public.recommendation_renewal_batches;
DROP POLICY IF EXISTS authenticated_select_recommendation_renewal_memberships
 ON public.recommendation_renewal_memberships;
DROP POLICY IF EXISTS pr55_admin_read_renewal_batches
 ON public.recommendation_renewal_batches;
DROP POLICY IF EXISTS pr55_admin_read_renewal_memberships
 ON public.recommendation_renewal_memberships;
CREATE POLICY pr55_admin_read_renewal_batches
 ON public.recommendation_renewal_batches
 FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
CREATE POLICY pr55_admin_read_renewal_memberships
 ON public.recommendation_renewal_memberships
 FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));

REVOKE ALL ON public.recommendation_renewal_batches,
 public.recommendation_renewal_memberships FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.recommendation_renewal_batches,
 public.recommendation_renewal_memberships TO authenticated;

-- All writes must go through separately audited authorized server RPCs.
-- This permission change intentionally breaks old direct member create/edit/
-- delete and batch UI flows until compatible replacements exist.
-- Requires separately approved secure admin UI and explicit release decision.
COMMIT;
