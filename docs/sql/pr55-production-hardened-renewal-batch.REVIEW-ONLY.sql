-- PR55 renewal RPC hardening candidate: REVIEW ONLY / NONEXECUTABLE.
-- Requires production revocable-admin allowlist, privilege closure, complete
-- schema-faithful renewal test, verified backup/restore, separate approval.
BEGIN;
DO $stop$
BEGIN
 RAISE EXCEPTION 'NO-GO: production renewal RPC patch is a review draft';
END $stop$;
-- The following statements are deliberately unreachable.

-- Dependency: registry_private.registration_administrators must have been
-- installed, granted, seeded, and verified by a separately approved change.
DO $guard$
BEGIN
 IF to_regclass('registry_private.registration_administrators') IS NULL
  OR to_regclass('public.recommendation_renewal_batches') IS NULL
  OR to_regclass('public.recommendation_renewal_memberships') IS NULL
  OR to_regprocedure('public.process_recommendation_renewal_batch(uuid,text,text,text,date,date,uuid[],text)') IS NULL
 THEN RAISE EXCEPTION 'PR55 renewal migration dependency missing' USING ERRCODE='42501';
 END IF;
END $guard$;

-- Replace the production fixed-JWT-email check with the same active,
-- revocable and row-locked grant check already used by PR55 in staging.
CREATE OR REPLACE FUNCTION public.check_renewal_admin_access()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_actor uuid := auth.uid();
BEGIN
 IF v_actor IS NULL THEN
   RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM registry_private.registration_administrators a
 WHERE a.user_id=v_actor AND a.active AND a.revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
 END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.check_renewal_admin_access()
FROM PUBLIC, anon, authenticated;

-- Keep the existing *8-argument* RPC signature to avoid breaking the app.
-- The client-provided next date is used ONLY to confirm the operator's
-- reviewed date, never as the authoritative stored expiration.
CREATE OR REPLACE FUNCTION public.process_recommendation_renewal_batch(
 p_batch_id uuid, p_parish text, p_ministry text, p_document_url text,
 p_renewal_date date, p_next_renewal_date date,
 p_membership_ids uuid[], p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=''
AS $fn$
DECLARE
 v_now timestamptz := transaction_timestamp();
 v_today date := (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 v_expires date;
 v_actor uuid := auth.uid();
 v_ids uuid[];
 v_expected int;
 v_locked int;
 v_in_scope int;
BEGIN
 PERFORM public.check_renewal_admin_access();

 IF p_batch_id IS NULL
    OR NULLIF(btrim(p_parish),'') IS NULL
    OR NULLIF(btrim(p_document_url),'') IS NULL
    OR p_renewal_date IS NULL
    OR p_next_renewal_date IS NULL
 THEN RAISE EXCEPTION 'Invalid renewal batch parameters' USING ERRCODE='22023';
 END IF;

 -- An administrative batch date may be historical (e.g. a letter received
 -- earlier); future dates must not activate validity before the event.
 IF p_renewal_date > v_today THEN
  RAISE EXCEPTION 'Future-dated renewal is not permitted' USING ERRCODE='22023';
 END IF;

 v_expires := (p_renewal_date + INTERVAL '1 year')::date;
 IF p_next_renewal_date IS DISTINCT FROM v_expires THEN
  RAISE EXCEPTION 'Renewal expires exactly one calendar year after renewal date'
    USING ERRCODE='22023';
 END IF;

 IF p_membership_ids IS NULL OR cardinality(p_membership_ids)=0
    OR cardinality(p_membership_ids)>100
    OR array_position(p_membership_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'Choose one to one hundred distinct assignments'
    USING ERRCODE='22023';
 END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
 FROM unnest(p_membership_ids) AS u(id);
 v_expected:=cardinality(v_ids);
 IF v_expected<>cardinality(p_membership_ids) THEN
   RAISE EXCEPTION 'Duplicate assignment identifiers'
     USING ERRCODE='22023';
 END IF;

 -- Lock parent members before selected assignments, in consistent order,
 -- to serialize against atomic verification and concurrent batch renewals.
 PERFORM 1 FROM public.members m
 WHERE m.id IN (
  SELECT mm.member_id FROM public.member_ministries mm WHERE mm.id=ANY(v_ids)
 ) ORDER BY m.id FOR UPDATE;

 PERFORM 1 FROM public.member_ministries mm
 WHERE mm.id=ANY(v_ids) ORDER BY mm.id FOR UPDATE;
 GET DIAGNOSTICS v_locked=ROW_COUNT;
 IF v_locked<>v_expected THEN
   RAISE EXCEPTION 'Some assignments no longer exist' USING ERRCODE='22023';
 END IF;

 SELECT count(*) INTO v_in_scope
 FROM public.member_ministries mm
 JOIN public.members m ON m.id=mm.member_id
 WHERE mm.id=ANY(v_ids) AND m.parish=btrim(p_parish)
   AND (NULLIF(btrim(p_ministry),'') IS NULL OR mm.ministry=btrim(p_ministry))
   AND mm.status IN ('New','Renewed');
 IF v_in_scope<>v_expected THEN
  RAISE EXCEPTION 'Assignment outside parish/ministry scope or not yet verified'
    USING ERRCODE='22023';
 END IF;

 INSERT INTO public.recommendation_renewal_batches(
  id,parish,ministry,document_url,document_uploaded_at,renewal_date,
  next_renewal_date,notes,processed_by,processed_at)
 VALUES(p_batch_id,btrim(p_parish),NULLIF(btrim(p_ministry),''),
        p_document_url,v_now,p_renewal_date,v_expires,
        NULLIF(btrim(p_notes),''),v_actor,v_now);

 INSERT INTO public.recommendation_renewal_memberships(
  batch_id,member_ministry_id,member_id,member_uid,member_name,parish,ministry,
  previous_status,previous_start_date,previous_expiration_date,
  previous_renewal_date,previous_document_url,
  result_status,result_expiration_date,result_renewal_date,result_document_url)
 SELECT p_batch_id,mm.id,m.id,m.uid,
        btrim(concat_ws(' ',m.first_name,m.last_name)),m.parish,mm.ministry,
        mm.status,mm.start_date,mm.expiration_date,mm.renewal_date,mm.document_url,
        'Renewed',v_expires,p_renewal_date,p_document_url
 FROM public.member_ministries mm JOIN public.members m ON m.id=mm.member_id
 WHERE mm.id=ANY(v_ids);

 UPDATE public.member_ministries mm SET
  archived_documents=CASE WHEN mm.document_url IS NULL
   THEN COALESCE(mm.archived_documents,'[]'::jsonb)
   ELSE COALESCE(mm.archived_documents,'[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
       'document_url',mm.document_url,'uploaded_at',mm.document_uploaded_at,
       'archived_at',v_now,'expiration_date',mm.expiration_date,
       'ministry',mm.ministry))
  END,
  status='Renewed',
  renewal_date=p_renewal_date,
  expiration_date=v_expires,
  document_url=p_document_url,
  document_uploaded_at=v_now,
  updated_at=v_now
 WHERE mm.id=ANY(v_ids);

 -- Keep legacy member summary consistent with remaining pending ministries;
 -- unselected assignments are untouched.
 WITH state AS (
   SELECT mm.member_id,
     count(*) FILTER (WHERE mm.status='Pending Verification') AS pending,
     count(*) FILTER (WHERE mm.status='Renewed' AND mm.expiration_date>=v_today) AS renewed,
     count(*) FILTER (WHERE mm.status='New' AND mm.expiration_date>=v_today) AS active_new,
     min(mm.expiration_date) FILTER (
       WHERE mm.status IN ('New','Renewed') AND mm.expiration_date>=v_today
     ) AS earliest
   FROM public.member_ministries mm
   WHERE mm.member_id IN (
     SELECT DISTINCT selected.member_id
     FROM public.member_ministries selected WHERE selected.id=ANY(v_ids)
   )
   GROUP BY mm.member_id
 )
 UPDATE public.members m
 SET status=CASE
    WHEN state.pending>0 THEN 'Pending Verification'
    WHEN state.renewed>0 THEN 'Renewed'
    WHEN state.active_new>0 THEN 'New'
    ELSE 'Inactive'
  END,
  expiration_date=CASE WHEN state.pending>0 THEN NULL ELSE state.earliest END,
  updated_at=v_now
 FROM state WHERE m.id=state.member_id;

 RETURN p_batch_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.process_recommendation_renewal_batch(
 uuid,text,text,text,date,date,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_recommendation_renewal_batch(
 uuid,text,text,text,date,date,uuid[],text) TO authenticated;

-- Staging must verify true Auth JWT admin/nonadmin denial, idempotency,
-- date clamping, scoped updates, history snapshot and concurrency before GO.
COMMIT;
