-- ISOLATED STAGING ONLY. Enforces one calendar year on New and Renewed
-- ministry assignments. No production schema migration or data backfill.
-- A historical mismatching assignment is checked only when its status/date
-- values change; unrelated metadata and notes can still be updated.
DO $guard$
BEGIN
  IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
    OR (SELECT count(*) FROM public.members) <> 1008
    OR (SELECT count(*) FROM public.member_ministries) <> 12
    OR (SELECT count(*) FROM public.member_ministries
        WHERE status <> 'Pending Verification') <> 0
    OR (SELECT count(*) FROM registry_private.registration_administrators
        WHERE active AND revoked_at IS NULL) <> 1
    OR to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NULL
    OR to_regprocedure('public.registry_attach_ministry_letter_v1(uuid,uuid,text)') IS NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_pr55_ministry_one_year'
        AND tgrelid = 'public.member_ministries'::regclass AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'PR55 one-year staging guard: unexpected baseline'
      USING ERRCODE = '42501';
  END IF;
END
$guard$;


CREATE OR REPLACE FUNCTION registry_private.enforce_member_ministry_year_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_check boolean;
  v_anchor date;
BEGIN
  -- Preserve pre-existing exceptions on unrelated metadata updates; validate
  -- every new row and every actual status/date transition.
  IF TG_OP = 'INSERT' THEN
    v_check := true;
  ELSE
    v_check := NEW.status IS DISTINCT FROM OLD.status
      OR NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.renewal_date IS DISTINCT FROM OLD.renewal_date
      OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date;
  END IF;

  IF NOT v_check OR NEW.status NOT IN ('New','Renewed') THEN
    RETURN NEW;
  END IF;

  v_anchor := CASE
    WHEN NEW.status = 'New' THEN NEW.start_date
    ELSE NEW.renewal_date
  END;

  IF v_anchor IS NULL
    OR NEW.expiration_date IS NULL
    OR NEW.expiration_date IS DISTINCT FROM (v_anchor + INTERVAL '1 year')::date
  THEN
    RAISE EXCEPTION
      'Active ministry registration must expire one calendar year after verification or renewal'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION registry_private.enforce_member_ministry_year_v1()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_pr55_ministry_one_year
BEFORE INSERT OR UPDATE ON public.member_ministries
FOR EACH ROW
EXECUTE FUNCTION registry_private.enforce_member_ministry_year_v1();

