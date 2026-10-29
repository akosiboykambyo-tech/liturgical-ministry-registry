-- PR55 staging-only administrative ACL and legacy direct-write rehearsal.
-- Transactional, synthetic data only. All temporary objects rolled back.
BEGIN;
DO $env$
BEGIN
 IF to_regclass('registry_private.registration_administrators') IS NULL
 OR to_regclass('public.recommendation_renewal_batches') IS NOT NULL
 OR to_regprocedure('public.registration_is_admin()') IS NULL
 OR (SELECT count(*) FROM public.members)<>1008
 OR (SELECT count(*) FROM public.member_ministries)<>12
 OR (SELECT count(*) FROM registry_private.registration_administrators
     WHERE active AND revoked_at IS NULL)<>1
 THEN RAISE EXCEPTION 'ACL lab requires isolated staging baseline' USING ERRCODE='42501';
 END IF;
END $env$;

CREATE SCHEMA registry_acl_lab;
REVOKE ALL ON SCHEMA registry_acl_lab FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA registry_acl_lab TO authenticated;
CREATE TABLE registry_acl_lab.renewal_history (
 id integer PRIMARY KEY, synopsis text NOT NULL
);
INSERT INTO registry_acl_lab.renewal_history VALUES(1,'PR55 SYNTHETIC HISTORY');
ALTER TABLE registry_acl_lab.renewal_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registry_acl_lab.renewal_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON registry_acl_lab.renewal_history TO authenticated;
CREATE POLICY pr55_acl_admin_read
ON registry_acl_lab.renewal_history
FOR SELECT TO authenticated
USING ((SELECT public.registration_is_admin()));

-- Exercise actual staging login grant with a real authenticated PostgreSQL
-- role. No JWT is issued here; real HTTP/JWT denials were tested separately.
DO $setup$
DECLARE actor uuid;
BEGIN
 SELECT user_id INTO STRICT actor
 FROM registry_private.registration_administrators
 WHERE active AND revoked_at IS NULL LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
END $setup$;
SET LOCAL ROLE authenticated;

DO $tests$
DECLARE n integer;denied boolean;
BEGIN
 IF public.registration_is_admin() IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Active administrator not recognized'; END IF;
 SELECT count(*) INTO n FROM registry_acl_lab.renewal_history;
 IF n<>1 THEN RAISE EXCEPTION 'Admin cannot read scoped synthetic history'; END IF;

 -- Even the administrator must not have direct table mutation privileges.
 denied:=false;
 BEGIN
  UPDATE registry_acl_lab.renewal_history SET synopsis='tamper' WHERE id=1;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Administrator retained legacy direct UPDATE'; END IF;

 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 IF public.registration_is_admin() IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Ungraned JWT subject passed administrator check'; END IF;
 SELECT count(*) INTO n FROM registry_acl_lab.renewal_history;
 IF n<>0 THEN RAISE EXCEPTION 'Ungraned user can read synthetic history'; END IF;
 SELECT count(*) INTO n FROM public.members;
 IF n<>0 THEN RAISE EXCEPTION 'Ungraned user can read protected staging members'; END IF;

 denied:=false;
 BEGIN
  DELETE FROM registry_acl_lab.renewal_history WHERE id=1;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Ungraned user retained DELETE privilege'; END IF;
END $tests$;
RESET ROLE;
SELECT 'PASS: active-admin history read, ungranted RLS denial, admin/nonadmin direct writes denied; all synthetic ACL objects rolled back' AS result;
ROLLBACK;
