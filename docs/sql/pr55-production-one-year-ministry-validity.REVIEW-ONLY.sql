-- PR55 RENEWAL ENFORCEMENT PROPOSAL: REVIEW ONLY / NONEXECUTABLE
-- Explicit release authorization, restoration and reconciliation required.
BEGIN;
DO $no_go$
BEGIN
  RAISE EXCEPTION
    'NO-GO: do not apply production renewal enforcement without approved security/restore gates';
END
$no_go$;
-- STOP: remaining SQL is unreachable.

-- Verified production baseline has two Renewed assignments; one expires
-- SHORTER than 1 calendar year after renewal. This trigger intentionally
-- leaves historic mismatches unchanged and permits unrelated metadata updates,
-- but rejects new or materially changed active validity tuples.
-- Separately reconcile that historical row before validating blanket
-- constraints. Authorization/write privileges must be fixed independently.
DO $guard$
BEGIN
  IF to_regclass('public.recommendation_renewal_batches') IS NULL
    OR to_regclass('public.recommendation_renewal_memberships') IS NULL
    OR to_regclass('public.member_ministries') IS NULL
    OR to_regclass('registry_private.registration_administrators') IS NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname='trg_pr55_ministry_one_year'
        AND tgrelid='public.member_ministries'::regclass AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'Production prerequisites or migration order missing'
      USING ERRCODE='42501';
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


-- Current production batch and snapshot tables have zero history rows.
-- Add NOT VALID checks to avoid table scans in future deployments.
ALTER TABLE public.recommendation_renewal_batches
  ADD CONSTRAINT pr55_batch_exact_calendar_year
  CHECK (next_renewal_date = (renewal_date + INTERVAL '1 year')::date)
  NOT VALID;

ALTER TABLE public.recommendation_renewal_memberships
  ADD CONSTRAINT pr55_renewal_snapshot_exact_year
  CHECK (
    result_status <> 'Renewed'
    OR result_expiration_date =
      (result_renewal_date + INTERVAL '1 year')::date
  )
  NOT VALID;

-- The existing batch SECURITY DEFINER function must be separately replaced
-- before enabling this migration: its current authorization checks a fixed JWT
-- email and it accepts a client-supplied p_next_renewal_date. The production
-- function must verify a revocable administrator grant with row locking,
-- calculate v_expiration from p_renewal_date on the server, and REQUIRE
-- p_next_renewal_date = v_expiration before storing the batch, snapshots or
-- selected memberships. It must preserve unrelated ministry statuses and
-- reject repeat/double-submitted batch IDs.
-- See companion PR55 hardened batch RPC proposal and schema-faithful tests.
COMMIT;
