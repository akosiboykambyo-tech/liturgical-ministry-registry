-- Independent attachments and letter-optional initial registration. No existing records are changed.

CREATE OR REPLACE FUNCTION public.registry_attach_ministry_letters_v2(p_assignment_ids uuid[], p_document_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid := auth.uid();
 v_ids uuid[];
 v_expected integer;
 v_locked integer;
 v_has_letter integer;
 v_parishes integer;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM registry_private.registration_administrators AS a WHERE a.user_id=v_actor AND a.active AND a.revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE='42501'; END IF;
 IF p_assignment_ids IS NULL OR cardinality(p_assignment_ids)=0 OR cardinality(p_assignment_ids)>100
    OR array_position(p_assignment_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'Select 1 to 100 valid ministry assignments' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids FROM unnest(p_assignment_ids) AS chosen(id);
 v_expected := cardinality(v_ids);
 IF v_expected <> cardinality(p_assignment_ids) THEN
   RAISE EXCEPTION 'Duplicate assignment IDs are not permitted' USING ERRCODE='22023';
 END IF;
 IF p_document_path IS NULL OR length(p_document_path)>200
    OR p_document_path !~ '^attachments/[a-f0-9-]{36}\.(pdf|png|jpg)$' THEN
   RAISE EXCEPTION 'Invalid immutable attachment path' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='member-documents' AND name=p_document_path) THEN
   RAISE EXCEPTION 'Private uploaded document is missing' USING ERRCODE='22023';
 END IF;
 -- Explicit row locks stop concurrent overwrites and serialize with verification.
 PERFORM 1 FROM public.members WHERE id IN
   (SELECT member_id FROM public.member_ministries WHERE id=ANY(v_ids))
   ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.member_ministries WHERE id=ANY(v_ids) ORDER BY id FOR UPDATE;
 GET DIAGNOSTICS v_locked = ROW_COUNT;
 IF v_locked <> v_expected THEN RAISE EXCEPTION 'One or more assignments do not exist' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO v_has_letter FROM public.member_ministries
   WHERE id=ANY(v_ids) AND document_url IS NOT NULL;
 IF v_has_letter>0 THEN RAISE EXCEPTION 'Existing letters cannot be overwritten by attachment' USING ERRCODE='22023'; END IF;
 -- Multi-member shared letters are restricted to one parish.
 SELECT count(DISTINCT lower(btrim(m.parish))) INTO v_parishes
   FROM public.member_ministries mm JOIN public.members m ON m.id=mm.member_id
   WHERE mm.id=ANY(v_ids);
 IF v_parishes<>1 THEN RAISE EXCEPTION 'Shared letters must cover one parish' USING ERRCODE='22023'; END IF;
 UPDATE public.member_ministries
    SET document_url=p_document_path,document_uploaded_at=transaction_timestamp()
    WHERE id=ANY(v_ids);
 -- Status, verification date, renewal date and expiration date are unchanged.
 RETURN jsonb_build_object('attached',true,'count',v_expected);
END;
$function$;
REVOKE ALL ON FUNCTION public.registry_attach_ministry_letters_v2(uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_attach_ministry_letters_v2(uuid[],text) TO authenticated;

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
      (p_status = 'New' AND (mm.status <> 'Pending Verification' OR mm.start_date IS NOT NULL OR mm.renewal_date IS NOT NULL OR mm.expiration_date IS NOT NULL))
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
$function$;

REVOKE ALL ON FUNCTION public.registry_verify_ministries_v2(uuid,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_verify_ministries_v2(uuid,uuid[],text) TO authenticated;
