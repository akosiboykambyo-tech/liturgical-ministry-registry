-- PR55 SECURITY CHANGESET - REVIEW ONLY / INTENTIONALLY NON-EXECUTABLE
-- Goal: atomic per-ministry verification, one-year server-side validity,
-- and revocable administrator authorization for the renewal path.
-- This proposal must not be pasted into a production SQL editor.
BEGIN;
DO $not_approved$
BEGIN
  RAISE EXCEPTION 'PR55 NO-GO: do not execute review SQL; release requires separate approval, staging tests, and restore proof';
END
$not_approved$;
-- STOP. The remaining SQL is deliberately unreachable until a reviewed release.

-- Phase A: verify that the PR55 private administrator allowlist has been
-- installed through its own approved migration. Never silently create or seed it.
DO $preflight$
BEGIN
  IF to_regclass('registry_private.registration_administrators') IS NULL
     OR to_regclass('public.member_ministries') IS NULL
     OR to_regclass('public.members') IS NULL
  THEN
    RAISE EXCEPTION 'Required admin allowlist and canonical registry tables missing'
      USING ERRCODE = '55000';
  END IF;
END
$preflight$;

-- Calendar arithmetic on PostgreSQL date values correctly clamps leap day
-- (2028-02-29 + one year = 2029-02-28).
-- Check is NOT VALID to avoid failing on older rows during installation;
-- new writes are constrained. A separate preflight/reconciliation is required
-- before VALIDATE CONSTRAINT.
ALTER TABLE public.recommendation_renewal_batches
  ADD CONSTRAINT recommendation_renewal_batches_exact_year_pr55
  CHECK (next_renewal_date = (renewal_date + INTERVAL '1 year')::date)
  NOT VALID;

-- Applies to all new or modified Renewed ministry rows, including those written
-- outside the batch renewal RPC. Historical noncompliant rows require preflight
-- before this constraint can be safely applied.
ALTER TABLE public.member_ministries
  ADD CONSTRAINT member_ministries_renewed_exact_year_pr55
  CHECK (
    status <> 'Renewed'
    OR (
      renewal_date IS NOT NULL
      AND expiration_date IS NOT NULL
      AND expiration_date = (renewal_date + INTERVAL '1 year')::date
    )
  )
  NOT VALID;

-- This function replaces the current fixed-JWT-email administrator check.
-- The grant is locked so a concurrent revocation serializes against the write.
-- Matching existing function signature avoids breaking the legacy renewal RPC.
CREATE OR REPLACE FUNCTION public.check_renewal_admin_access()
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Administrator access required'
      USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM registry_private.registration_administrators AS a
  WHERE a.user_id = v_actor AND a.active = true AND a.revoked_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Administrator access required'
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.check_renewal_admin_access()
  FROM PUBLIC, anon, authenticated;
-- Existing SECURITY DEFINER batch function calls this with its privileged owner.

-- Selected assignment IDs are the ONLY assignments this action may verify.
-- Member summary stays Pending Verification if any other assignment is pending.
-- No client-supplied expiry date is accepted. The authoritative verification
-- date comes from the database in the project's Asia/Manila operating timezone.
CREATE OR REPLACE FUNCTION public.registry_verify_ministries_v1(
  p_member_id uuid,
  p_membership_ids uuid[],
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_today date := (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date;
  v_expires date;
  v_ids uuid[];
  v_expected integer;
  v_locked integer;
  v_invalid integer;
  v_pending integer;
  v_active_new integer;
  v_active_renewed integer;
  v_earliest date;
  v_member_status text;
BEGIN
  -- Avoid trusting frontend admin labels, user_metadata or JWT email.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM registry_private.registration_administrators AS a
  WHERE a.user_id = v_actor AND a.active = true AND a.revoked_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Administrator authorization required'
      USING ERRCODE = '42501';
  END IF;

  IF p_member_id IS NULL OR (p_status IS NULL OR p_status NOT IN ('New','Renewed'))
  THEN
    RAISE EXCEPTION 'Invalid member or verification decision'
      USING ERRCODE = '22023';
  END IF;
  IF p_membership_ids IS NULL OR cardinality(p_membership_ids) = 0
     OR array_position(p_membership_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Select at least one valid ministry assignment'
      USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT id ORDER BY id)
    INTO v_ids
    FROM unnest(p_membership_ids) AS chosen(id);
  v_expected := cardinality(v_ids);
  IF v_expected <> cardinality(p_membership_ids) OR v_expected > 100 THEN
    RAISE EXCEPTION 'Duplicate or excessive ministry assignment IDs'
      USING ERRCODE = '22023';
  END IF;
  -- Serialize a member's verification/renewal activity at the parent row.
  PERFORM 1 FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = '22023';
  END IF;
  -- Lock only the selected assignments and reject any other member's IDs.
  PERFORM 1 FROM public.member_ministries AS mm
  WHERE mm.member_id = p_member_id AND mm.id = ANY(v_ids)
  ORDER BY mm.id FOR UPDATE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> v_expected THEN
    RAISE EXCEPTION 'Assignments do not all belong to this member'
      USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_invalid
  FROM public.member_ministries AS mm
  WHERE mm.id = ANY(v_ids)
    AND (
      (p_status = 'New' AND (mm.status <> 'Pending Verification' OR mm.document_url IS NULL))
      OR (p_status = 'Renewed' AND
          (mm.status NOT IN ('New','Renewed') OR mm.document_url IS NULL))
    );
  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'Assignment is not eligible for this decision or lacks a renewal letter'
      USING ERRCODE = '22023';
  END IF;
  v_expires := (v_today + INTERVAL '1 year')::date;

  UPDATE public.member_ministries AS mm
  SET status = p_status,
      start_date = CASE WHEN p_status = 'New' THEN v_today ELSE mm.start_date END,
      renewal_date = CASE WHEN p_status = 'Renewed' THEN v_today ELSE NULL END,
      expiration_date = v_expires,
      updated_at = transaction_timestamp()
  WHERE mm.member_id = p_member_id AND mm.id = ANY(v_ids);

  SELECT
    count(*) FILTER (WHERE status = 'Pending Verification'),
    count(*) FILTER (WHERE status = 'New'
                      AND expiration_date >= v_today),
    count(*) FILTER (WHERE status = 'Renewed'
                      AND expiration_date >= v_today),
    min(expiration_date) FILTER (WHERE status IN ('New','Renewed')
                                 AND expiration_date >= v_today)
  INTO v_pending, v_active_new, v_active_renewed, v_earliest
  FROM public.member_ministries WHERE member_id = p_member_id;

  v_member_status := CASE
    WHEN v_pending > 0 THEN 'Pending Verification'
    WHEN v_active_renewed > 0 THEN 'Renewed'
    WHEN v_active_new > 0 THEN 'New'
    ELSE 'Inactive'
  END;
  UPDATE public.members
  SET status = v_member_status,
      expiration_date = CASE WHEN v_pending > 0 THEN NULL ELSE v_earliest END,
      updated_at = transaction_timestamp()
  WHERE id = p_member_id;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'updated_assignments', v_expected,
    'member_status', v_member_status,
    'expires_on', v_expires
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.registry_verify_ministries_v1(uuid,uuid[],text)
  FROM PUBLIC, anon, authenticated;
-- Phase B, AFTER audited grant seeding + Auth/RLS + rollback checks:
-- GRANT EXECUTE ON FUNCTION public.registry_verify_ministries_v1(uuid,uuid[],text) TO authenticated;
-- Never grant to anon or PUBLIC. Any authenticated caller without an active
-- registry_private grant is rejected by the function itself.
COMMIT;
