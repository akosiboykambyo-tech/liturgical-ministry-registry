-- PR79 STAGING-VALIDATED CANDIDATE (2026-11-12)
-- DO NOT RUN ON PRODUCTION until signed HTTP/JWT Storage and recovery gates pass.
-- Replayable, idempotent function definitions from staging migration.
-- Staging migration ID/name: pr79_stage_certificate_and_per_ministry_document_guards
-- Preserves certificate service_role-only EXECUTE and guarded verification admin check.

CREATE OR REPLACE FUNCTION public.allocate_certificate_issuance(p_registry_id text, p_member_ministry_id uuid)
 RETURNS TABLE(issuance_number integer, reprint_suffix text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_member_id uuid;
  v_ministry text;
  v_status text;
  v_expiration_date date;
  v_count integer;
BEGIN
  -- Validate input.
  IF p_registry_id IS NULL
     OR length(btrim(p_registry_id)) < 1
     OR length(p_registry_id) > 50
     OR p_member_ministry_id IS NULL
  THEN
    RAISE EXCEPTION 'Invalid certificate request'
      USING ERRCODE = '22023';
  END IF;

  -- Verify that the Registry ID corresponds to
  -- the specified member ministry.
  SELECT
    m.id,
    mm.ministry,
    mm.status,
    mm.expiration_date
  INTO
    v_member_id,
    v_ministry,
    v_status,
    v_expiration_date
  FROM public.members AS m
  JOIN public.member_ministries AS mm
    ON mm.member_id = m.id
  WHERE m.uid = upper(btrim(p_registry_id))
    AND mm.id = p_member_ministry_id;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Certificate record not found'
      USING ERRCODE = '22023';
  END IF;

  -- Match the website's certificate eligibility rules.
  IF v_status NOT IN ('New', 'Renewed')
     OR v_expiration_date IS NULL
     OR v_expiration_date < (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date
  THEN
    RAISE EXCEPTION 'Certificate is not eligible for issuance'
      USING ERRCODE = '22023';
  END IF;

  -- Allocate the next issuance number atomically.
  --
  -- The first successful allocation is number 1.
  -- Subsequent allocations receive numbers 2, 3, etc.
  --
  -- This uses the existing unique partial index
  -- idx_cert_downloads_membership.

  INSERT INTO public.certificate_downloads (
    member_id,
    member_ministry_id,
    ministry,
    download_count,
    created_at,
    updated_at
  )
  VALUES (
    v_member_id,
    p_member_ministry_id,
    v_ministry,
    1,
    now(),
    now()
  )
  ON CONFLICT (member_ministry_id)
    WHERE member_ministry_id IS NOT NULL
  DO UPDATE SET
    download_count =
      public.certificate_downloads.download_count + 1,
    updated_at = now()
  RETURNING download_count INTO v_count;

  RETURN QUERY
  SELECT
    v_count,
    CASE
      WHEN v_count = 1 THEN ''::text
      ELSE '-R' || v_count::text
    END;
END;
$function$;

REVOKE ALL ON FUNCTION public.allocate_certificate_issuance(text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_certificate_issuance(text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registry_verify_ministries_v2(p_member_id uuid, p_membership_ids uuid[], p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      (p_status = 'New' AND (
        mm.status <> 'Pending Verification'
        OR mm.start_date IS NOT NULL
        OR mm.renewal_date IS NOT NULL
        OR mm.expiration_date IS NOT NULL
      ))
      OR (p_status = 'Renewed' AND mm.status NOT IN ('New','Renewed'))
      OR mm.document_url IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects AS o
        WHERE o.bucket_id = 'member-documents' AND o.name = mm.document_url
      )
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
$function$;

REVOKE ALL ON FUNCTION public.registry_verify_ministries_v2(uuid,uuid[],text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_verify_ministries_v2(uuid,uuid[],text)
  TO authenticated, service_role;
