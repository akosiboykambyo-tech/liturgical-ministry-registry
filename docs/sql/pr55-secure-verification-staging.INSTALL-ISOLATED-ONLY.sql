-- PR55 ISOLATED STAGING ONLY. Source function is identical to the reviewed PR55 proposal.
-- DO NOT EXECUTE IN PRODUCTION. Staging schema signature and counts form a fail-closed guard.
-- PR56 frontend feature flag is NOT activated by this migration.
DO $staging_guard$
DECLARE v_type text;
BEGIN
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='member_ministries' AND column_name='status';
  IF v_type <> 'text'
    OR to_regclass('registry_private.registration_administrators') IS NULL
    OR to_regclass('public.recommendation_renewal_batches') IS NOT NULL
    OR (SELECT count(*) FROM auth.users) <> 2
    OR (SELECT count(*) FROM registry_private.registration_administrators
        WHERE active=true AND revoked_at IS NULL) <> 1
    OR to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'PR55 staging-only guard failed: schema or administrator count mismatch'
    USING ERRCODE = '42501';
  END IF;
END
$staging_guard$;

-- Public SELECT is limited by the active private grant; no INSERT/UPDATE/DELETE
-- role grants are introduced. Authorized admins may read pending ministry rows.
GRANT SELECT ON public.member_ministries TO authenticated;
CREATE POLICY pr55_secure_admin_read_member_ministries ON public.member_ministries
FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));

-- Keep this permission consistent with existing member lookup without
-- granting other Auth users additional row access.
CREATE POLICY pr55_secure_admin_read_members ON public.members
FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));

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
GRANT EXECUTE ON FUNCTION public.registry_verify_ministries_v1(uuid,uuid[],text)
TO authenticated;
-- SECURITY DEFINER function verifies the active grant under FOR SHARE lock
-- inside each call; the grant is not a stand-alone authorization boundary.
