-- Reference copy of the tested PR55 candidate. NOT A MIGRATION.
-- Do not apply to production. The first statement deliberately fails closed.
-- Rehearse only on isolated staging AFTER the required schema/RLS parity check.
BEGIN;
DO $pr79_stop$ BEGIN
  RAISE EXCEPTION 'NO-GO: PR79 guarded CRUD candidate requires independent signed JWT and backup certification';
END $pr79_stop$;
-- PR55 CANDIDATE ONLY. Deploy to isolated TEST first. DO NOT run on production
-- until real HTTP/JWT + UI regressions pass and independent recovery is certified.
-- This file defines scoped, audited write operations; it does NOT revoke old table grants.
-- Existing Supabase registry_private.registration_administrators must already exist.
DO $compatibility$
BEGIN
  -- No incomplete staging/prod deployment with missing historical dependencies.
  IF to_regclass('registry_private.registration_administrators') IS NULL OR
     to_regclass('public.members') IS NULL OR
     to_regclass('public.member_ministries') IS NULL OR
     to_regclass('public.import_batches') IS NULL OR
     to_regclass('public.duplicate_flags') IS NULL OR
     to_regclass('public.recommendation_renewal_memberships') IS NULL OR
     to_regclass('public.certificate_downloads') IS NULL OR
     to_regclass('public.name_correction_requests') IS NULL OR
     to_regclass('public.public_reports') IS NULL THEN
    RAISE EXCEPTION 'PR55 write cutover requires full production-compatible registry history schema'
      USING ERRCODE='55000';
  END IF;
END
$compatibility$;

CREATE OR REPLACE FUNCTION registry_private.registry_sync_member_mirror_v1(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $mirror$
DECLARE
  v_ministries text[];
  v_count integer;
  v_pending integer;
  v_new integer;
  v_renewed integer;
  v_earliest date;
  v_today date := (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  SELECT array_agg(ministry ORDER BY ministry), count(*),
         count(*) FILTER (WHERE status='Pending Verification'),
         count(*) FILTER (WHERE status='New' AND expiration_date >= v_today),
         count(*) FILTER (WHERE status='Renewed' AND expiration_date >= v_today),
         min(expiration_date) FILTER (WHERE status IN ('New','Renewed') AND expiration_date >= v_today)
  INTO v_ministries,v_count,v_pending,v_new,v_renewed,v_earliest
  FROM public.member_ministries WHERE member_id=p_member_id;
  IF v_count=0 THEN
    RAISE EXCEPTION 'A member must have at least one ministry' USING ERRCODE='22023';
  END IF;
  UPDATE public.members SET
    ministries=v_ministries,
    status=CASE WHEN v_pending>0 THEN 'Pending Verification'
                WHEN v_renewed>0 THEN 'Renewed'
                WHEN v_new>0 THEN 'New'
                ELSE 'Inactive' END,
    expiration_date=CASE WHEN v_pending>0 THEN NULL ELSE v_earliest END,
    updated_at=transaction_timestamp()
  WHERE id=p_member_id;
END
$mirror$;
REVOKE ALL ON FUNCTION registry_private.registry_sync_member_mirror_v1(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registry_admin_member_write_v1(
  p_action text, p_data jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $write$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_assignment_id uuid;
  v_member public.members%ROWTYPE;
  v_existing public.member_ministries%ROWTYPE;
  v_item jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_result jsonb;
  v_ministries text[];
  v_seen text[] := ARRAY[]::text[];
  v_ministry text;
  v_status text;
  v_first text;
  v_last text;
  v_parish text;
  v_notes text;
  v_service_year integer;
  v_path text;
  v_old_path text;
  v_current_date date := (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date;
  v_new_expiration date;
  v_count integer;
  v_batch uuid;
  v_valid_ministries constant text[] := ARRAY[
    'Mother Butler Guild','Ministry of Greeters and Collectors',
    'Extraordinary Ministers of Holy Communion',
    'Ministry of Lectors and Commentators',
    'Ministry of Liturgical Music','Ministry of Altar Servers'
  ];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM registry_private.registration_administrators a
    WHERE a.user_id=v_actor AND a.active=true AND a.revoked_at IS NULL
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE='42501';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN
    RAISE EXCEPTION 'Expected JSON object' USING ERRCODE='22023';
  END IF;

  IF p_action IN ('create','create_batch','merge','save')
    AND p_data ? 'ministries' THEN
    IF jsonb_typeof(p_data->'ministries')<>'array' THEN
      RAISE EXCEPTION 'Ministries must be an array' USING ERRCODE='22023';
    END IF;
    SELECT array_agg(DISTINCT item) INTO v_ministries
      FROM jsonb_array_elements_text(p_data->'ministries') AS m(item);
    IF v_ministries IS NULL OR cardinality(v_ministries)>6 OR
       EXISTS(SELECT 1 FROM unnest(v_ministries) AS m(value)
              WHERE NOT (m.value=ANY(v_valid_ministries))) THEN
      RAISE EXCEPTION 'Select one or more recognized ministries' USING ERRCODE='22023';
    END IF;
  END IF;

  IF p_action='create' THEN
    v_first:=trim(coalesce(p_data->>'first_name',''));
    v_last:=trim(coalesce(p_data->>'last_name',''));
    v_parish:=trim(coalesce(p_data->>'parish',''));
    v_notes:=nullif(trim(coalesce(p_data->>'notes','')),'');
    v_service_year:=(p_data->>'service_year')::integer;
    IF v_first='' OR v_last='' OR v_parish='' OR
       length(v_first)>160 OR length(v_last)>160 OR length(v_parish)>200 OR
       length(coalesce(v_notes,''))>4000 OR
       v_service_year IS NULL OR v_service_year NOT BETWEEN 1900 AND 2100 OR
       v_ministries IS NULL THEN
      RAISE EXCEPTION 'Invalid member name, parish, year, notes or ministries'
        USING ERRCODE='22023';
    END IF;
    INSERT INTO public.members (
      first_name,last_name,parish,ministries,service_year,status,uid,notes
    ) VALUES (
      v_first,v_last,v_parish,v_ministries,v_service_year,
      'Pending Verification','PENDING',v_notes
    ) RETURNING * INTO v_member;
    INSERT INTO public.member_ministries(member_id,ministry,status)
      SELECT v_member.id,ministry,'Pending Verification'
      FROM unnest(v_ministries) AS selected(ministry);
    RETURN jsonb_build_object('member',to_jsonb(v_member),'id',v_member.id);
  END IF;

  IF p_action='create_batch' THEN
    IF jsonb_typeof(p_data->'rows')<>'array' OR
       jsonb_array_length(p_data->'rows') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Batch must contain between 1 and 100 members'
        USING ERRCODE='22023';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_data->'rows') LOOP
      BEGIN
        v_result:=public.registry_admin_member_write_v1('create',v_item);
        v_rows:=v_rows || jsonb_build_array(jsonb_build_object(
          'status','created','id',v_result->>'id'));
      EXCEPTION WHEN unique_violation THEN
        v_rows:=v_rows || jsonb_build_array(jsonb_build_object(
          'status','duplicate','error','Duplicate member'));
      WHEN OTHERS THEN
        v_rows:=v_rows || jsonb_build_array(jsonb_build_object(
          'status','error','error',SQLERRM,'code',SQLSTATE));
      END;
    END LOOP;
    RETURN jsonb_build_object('rows',v_rows);
  END IF;

  IF p_action IN ('merge','save','delete','document','renew','activate','detach','set_status') THEN
    v_id:=(p_data->>'member_id')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'A member ID is required' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_member FROM public.members WHERE id=v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Member not found' USING ERRCODE='22023';
    END IF;
  END IF;

  IF p_action='merge' THEN
    IF v_ministries IS NULL THEN
      RAISE EXCEPTION 'Choose at least one recognized ministry' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.member_ministries(member_id,ministry,status)
      SELECT v_id,ministry,'Pending Verification'
      FROM unnest(v_ministries) AS selected(ministry)
      ON CONFLICT (member_id,ministry) DO NOTHING;
    PERFORM registry_private.registry_sync_member_mirror_v1(v_id);
    RETURN jsonb_build_object('member_id',v_id,'merged',true);
  END IF;

  IF p_action='save' THEN
    v_first:=CASE WHEN p_data ? 'first_name'
      THEN trim(coalesce(p_data->>'first_name','')) ELSE v_member.first_name END;
    v_last:=CASE WHEN p_data ? 'last_name'
      THEN trim(coalesce(p_data->>'last_name','')) ELSE v_member.last_name END;
    v_parish:=CASE WHEN p_data ? 'parish'
      THEN trim(coalesce(p_data->>'parish','')) ELSE v_member.parish END;
    v_notes:=CASE WHEN p_data ? 'notes'
      THEN nullif(trim(coalesce(p_data->>'notes','')),'') ELSE v_member.notes END;
    IF v_first='' OR v_last='' OR v_parish='' OR
      length(v_first)>160 OR length(v_last)>160 OR length(v_parish)>200 OR
      length(coalesce(v_notes,''))>4000 THEN
      RAISE EXCEPTION 'Invalid member name, parish or notes' USING ERRCODE='22023';
    END IF;
    UPDATE public.members SET first_name=v_first,last_name=v_last,
      parish=v_parish,notes=v_notes,updated_at=transaction_timestamp()
    WHERE id=v_id;

    IF p_data ? 'memberships' OR p_data ? 'ministries' THEN
      IF p_data ? 'memberships' THEN
        IF jsonb_typeof(p_data->'memberships')<>'array' THEN
          RAISE EXCEPTION 'Membership drafts must be an array' USING ERRCODE='22023';
        END IF;
        v_rows:=p_data->'memberships';
      ELSE
        v_rows:='[]'::jsonb;
        FOR v_ministry IN SELECT unnest(v_ministries) LOOP
          v_rows:=v_rows || jsonb_build_array(jsonb_build_object('ministry',v_ministry));
        END LOOP;
      END IF;
      IF jsonb_array_length(v_rows) NOT BETWEEN 1 AND 6 THEN
        RAISE EXCEPTION 'Choose between one and six ministries'
          USING ERRCODE='22023';
      END IF;

      FOR v_item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
        v_ministry:=v_item->>'ministry';
        IF v_ministry IS NULL OR NOT (v_ministry=ANY(v_valid_ministries))
          OR v_ministry=ANY(v_seen) THEN
          RAISE EXCEPTION 'Invalid or duplicate ministry assignment'
            USING ERRCODE='22023';
        END IF;
        v_seen:=array_append(v_seen,v_ministry);
        SELECT * INTO v_existing FROM public.member_ministries
          WHERE member_id=v_id AND ministry=v_ministry FOR UPDATE;
        IF FOUND THEN
          IF v_item ? 'id' AND nullif(v_item->>'id','') IS NOT NULL AND
             (v_item->>'id')::uuid<>v_existing.id THEN
            RAISE EXCEPTION 'Ministry assignment ID mismatch' USING ERRCODE='22023';
          END IF;
          v_status:=coalesce(v_item->>'status',v_existing.status);
          IF v_status NOT IN ('Pending Verification','New','Renewed','Inactive') THEN
            RAISE EXCEPTION 'Invalid ministry status' USING ERRCODE='22023';
          END IF;
          IF v_status<>v_existing.status AND v_status IN ('New','Renewed') THEN
            RAISE EXCEPTION 'Use document-backed ministry verification/renewal, not direct status editing'
              USING ERRCODE='22023';
          END IF;
          -- Historical validity cannot be rewritten via the generic edit screen.
          IF v_status IN ('New','Renewed') AND (
            (v_item ? 'start_date' AND
             coalesce(v_item->>'start_date','') IS DISTINCT FROM
             coalesce(v_existing.start_date::text,'')) OR
            (v_item ? 'renewal_date' AND
             coalesce(v_item->>'renewal_date','') IS DISTINCT FROM
             coalesce(v_existing.renewal_date::text,'')) OR
            (v_item ? 'expiration_date' AND
             coalesce(v_item->>'expiration_date','') IS DISTINCT FROM
             coalesce(v_existing.expiration_date::text,''))
          ) THEN
            RAISE EXCEPTION 'Verified ministry validity dates are read-only here'
              USING ERRCODE='22023';
          END IF;
          IF v_status<>v_existing.status THEN
            UPDATE public.member_ministries SET status=v_status,
              start_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE start_date END,
              renewal_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE renewal_date END,
              expiration_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE expiration_date END
            WHERE id=v_existing.id;
          END IF;
        ELSE
          IF coalesce(v_item->>'status','Pending Verification')<>'Pending Verification' THEN
            RAISE EXCEPTION 'New ministry assignments start as Pending Verification'
              USING ERRCODE='22023';
          END IF;
          INSERT INTO public.member_ministries(member_id,ministry,status)
            VALUES(v_id,v_ministry,'Pending Verification');
        END IF;
      END LOOP;
      FOR v_existing IN SELECT * FROM public.member_ministries
        WHERE member_id=v_id AND NOT (ministry=ANY(v_seen)) FOR UPDATE LOOP
        IF v_existing.status<>'Pending Verification'
           OR v_existing.document_url IS NOT NULL
           OR v_existing.archived_documents<>'[]'::jsonb
           OR EXISTS (SELECT 1 FROM public.recommendation_renewal_memberships h
                      WHERE h.member_ministry_id=v_existing.id) THEN
          RAISE EXCEPTION 'Verified, documented or historical ministry assignments cannot be removed here'
            USING ERRCODE='22023';
        END IF;
        DELETE FROM public.member_ministries WHERE id=v_existing.id;
      END LOOP;
      PERFORM registry_private.registry_sync_member_mirror_v1(v_id);
    END IF;
    IF p_data ? 'status' AND (p_data->>'status') IS DISTINCT FROM v_member.status THEN
      v_status:=p_data->>'status';
      IF v_status NOT IN ('Pending Verification','Inactive') THEN
        RAISE EXCEPTION 'New/Renewed requires ministry-specific letter verification'
          USING ERRCODE='22023';
      END IF;
      UPDATE public.member_ministries SET
        status=v_status,
        start_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE start_date END,
        expiration_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE expiration_date END,
        renewal_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE renewal_date END
      WHERE member_id=v_id;
      PERFORM registry_private.registry_sync_member_mirror_v1(v_id);
    END IF;
    RETURN jsonb_build_object('member_id',v_id,'saved',true);
  END IF;

  IF p_action='set_status' THEN
    v_status:=p_data->>'status';
    IF v_status NOT IN ('Pending Verification','Inactive') THEN
      RAISE EXCEPTION 'Approve individual ministries only through document-backed verification'
        USING ERRCODE='22023';
    END IF;
    UPDATE public.member_ministries SET
      status=v_status,
      start_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE start_date END,
      expiration_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE expiration_date END,
      renewal_date=CASE WHEN v_status='Pending Verification' THEN NULL ELSE renewal_date END
    WHERE member_id=v_id;
    PERFORM registry_private.registry_sync_member_mirror_v1(v_id);
    RETURN (SELECT to_jsonb(m) FROM public.members m WHERE id=v_id);
  END IF;

  IF p_action='document' THEN
    v_path:=nullif(trim(coalesce(p_data->>'document_path','')),'');
    IF v_path IS NOT NULL THEN
      IF left(v_path,length(v_id::text)+1)<>(v_id::text || '/') OR
         NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='member-documents'
           AND o.name=v_path) THEN
        RAISE EXCEPTION 'The private legacy member document was not uploaded'
          USING ERRCODE='22023';
      END IF;
    END IF;
    UPDATE public.members SET document_url=v_path,updated_at=transaction_timestamp()
    WHERE id=v_id;
    RETURN jsonb_build_object('member_id',v_id,'document_url',v_path);
  END IF;

  IF p_action IN ('renew','activate','detach') THEN
    v_assignment_id:=(p_data->>'membership_id')::uuid;
    IF v_assignment_id IS NULL THEN
      RAISE EXCEPTION 'Ministry assignment ID required' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_existing FROM public.member_ministries
      WHERE id=v_assignment_id AND member_id=v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assignment does not belong to this member'
        USING ERRCODE='22023';
    END IF;
    v_old_path:=v_existing.document_url;

    IF p_action IN ('renew','activate') THEN
      v_path:=nullif(trim(coalesce(p_data->>'document_path','')),'');
      IF (p_action='renew' AND v_existing.status NOT IN ('New','Renewed')) OR
         (p_action='activate' AND v_existing.status<>'Pending Verification') OR
         v_path IS NULL OR
         left(v_path,length('verification/' || v_id || '/' || v_assignment_id || '/')) <>
           ('verification/' || v_id || '/' || v_assignment_id || '/') OR
         NOT EXISTS (SELECT 1 FROM storage.objects o
           WHERE o.bucket_id='member-documents' AND o.name=v_path) THEN
        RAISE EXCEPTION 'Eligible ministry and uploaded private renewal letter required'
          USING ERRCODE='22023';
      END IF;
      v_new_expiration:=(v_current_date + interval '1 year')::date;
      v_status:=CASE WHEN p_action='activate' THEN 'New' ELSE 'Renewed' END;
      UPDATE public.member_ministries SET status=v_status,
        start_date=CASE WHEN p_action='activate' THEN v_current_date ELSE start_date END,
        renewal_date=CASE WHEN p_action='renew' THEN v_current_date ELSE NULL END,
        expiration_date=v_new_expiration,
        document_url=v_path,document_uploaded_at=transaction_timestamp(),
        archived_documents=CASE WHEN v_old_path IS NULL THEN archived_documents
          ELSE archived_documents || jsonb_build_array(jsonb_build_object(
            'document_url',v_old_path,
            'uploaded_at',v_existing.document_uploaded_at,
            'archived_at',transaction_timestamp(),
            'expiration_date',v_existing.expiration_date,
            'ministry',v_existing.ministry
          )) END
      WHERE id=v_assignment_id;
      UPDATE public.members SET document_url=v_path WHERE id=v_id;
      PERFORM registry_private.registry_sync_member_mirror_v1(v_id);
      RETURN jsonb_build_object('member_id',v_id,'membership_id',v_assignment_id,
        'status',v_status,'expires_on',v_new_expiration);
    END IF;

    -- Detach retains the physical evidence object. Never delete Storage first.
    UPDATE public.member_ministries SET status='Pending Verification',
      start_date=NULL,renewal_date=NULL,expiration_date=NULL,
      document_url=NULL,document_uploaded_at=NULL,
      archived_documents=CASE WHEN v_old_path IS NULL THEN archived_documents
        ELSE archived_documents || jsonb_build_array(jsonb_build_object(
          'document_url',v_old_path,
          'uploaded_at',v_existing.document_uploaded_at,
          'archived_at',transaction_timestamp(),
          'expiration_date',v_existing.expiration_date,
          'ministry',v_existing.ministry
        )) END
    WHERE id=v_assignment_id;
    IF v_member.document_url=v_old_path AND v_old_path IS NOT NULL THEN
      UPDATE public.members SET document_url=NULL WHERE id=v_id;
    END IF;
    PERFORM registry_private.registry_sync_member_mirror_v1(v_id);
    RETURN jsonb_build_object('member_id',v_id,'detached',true,'evidence_retained',true);
  END IF;

  IF p_action='delete' THEN
    IF v_member.document_url IS NOT NULL OR v_member.archived_documents<>'[]'::jsonb
       OR EXISTS(SELECT 1 FROM public.member_ministries mm WHERE mm.member_id=v_id
                 AND (mm.status<>'Pending Verification' OR mm.document_url IS NOT NULL
                 OR mm.archived_documents<>'[]'::jsonb))
       OR EXISTS(SELECT 1 FROM public.recommendation_renewal_memberships rr
                 WHERE rr.member_id=v_id)
       OR EXISTS(SELECT 1 FROM public.certificate_downloads c WHERE c.member_id=v_id)
       OR EXISTS(SELECT 1 FROM public.duplicate_flags f WHERE f.existing_member_id=v_id)
       OR EXISTS(SELECT 1 FROM public.name_correction_requests n WHERE n.member_id=v_id)
       OR EXISTS(SELECT 1 FROM public.public_reports r WHERE r.member_id=v_id)
       OR EXISTS(SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='member-documents' AND (
           left(o.name,length(v_id::text)+1)=v_id::text||'/' OR
           left(o.name,length('verification/'||v_id::text||'/'))=
             'verification/'||v_id::text||'/'
         )) THEN
      RAISE EXCEPTION 'This record has evidence or dependent history; use a reviewed reconciliation process'
        USING ERRCODE='22023';
    END IF;
    DELETE FROM public.members WHERE id=v_id;
    RETURN jsonb_build_object('member_id',v_id,'deleted',true);
  END IF;

  IF p_action='flag_duplicate' THEN
    v_id:=(p_data->>'existing_member_id')::uuid;
    IF v_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.members WHERE id=v_id) OR
       jsonb_typeof(p_data->'incoming_data')<>'object' OR
       jsonb_typeof(p_data->'incoming_ministries')<>'array' THEN
      RAISE EXCEPTION 'Valid existing member and incoming duplicate are required'
        USING ERRCODE='22023';
    END IF;
    SELECT array_agg(DISTINCT x) INTO v_ministries
      FROM jsonb_array_elements_text(p_data->'incoming_ministries') AS m(x);
    IF v_ministries IS NULL OR cardinality(v_ministries)>6 OR
       EXISTS(SELECT 1 FROM unnest(v_ministries) AS m(x)
              WHERE NOT (m.x=ANY(v_valid_ministries))) THEN
      RAISE EXCEPTION 'Invalid duplicate ministry list' USING ERRCODE='22023';
    END IF;
    -- Only the production-common columns are used: staging has extra legacy
    -- descriptive fields that do NOT exist in production.
    INSERT INTO public.duplicate_flags(existing_member_id,incoming_data,resolved)
    VALUES(v_id,p_data->'incoming_data',false)
    RETURNING id INTO v_batch;
    RETURN jsonb_build_object('id',v_batch,'flagged',true);
  END IF;

  IF p_action='import_begin' THEN
    IF coalesce(p_data->>'file_hash','') !~ '^[a-fA-F0-9]{64}$' OR
       length(coalesce(p_data->>'file_name',''))>240 OR
       (p_data->>'row_count')::integer NOT BETWEEN 1 AND 3000 OR
       (p_data->>'duplicates_routed')::integer NOT BETWEEN 0 AND 3000 THEN
      RAISE EXCEPTION 'Invalid import batch metadata' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.import_batches(file_hash,file_name,row_count,unique_inserted,
      duplicates_routed,status)
    VALUES(lower(p_data->>'file_hash'),p_data->>'file_name',
      (p_data->>'row_count')::integer,0,
      (p_data->>'duplicates_routed')::integer,'processing')
    ON CONFLICT (file_hash) DO NOTHING RETURNING id INTO v_batch;
    RETURN jsonb_build_object('id',v_batch,'already_imported',v_batch IS NULL);
  END IF;

  IF p_action='import_finish' THEN
    v_batch:=(p_data->>'batch_id')::uuid;
    v_count:=(p_data->>'unique_inserted')::integer;
    UPDATE public.import_batches SET unique_inserted=v_count,
      status='completed',completed_at=transaction_timestamp()
    WHERE id=v_batch AND status='processing' AND
      v_count BETWEEN 0 AND row_count
    RETURNING id INTO v_batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Import batch not found, finalized or invalid result count'
        USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('id',v_batch,'completed',true);
  END IF;

  RAISE EXCEPTION 'Unknown administrator member-write operation'
    USING ERRCODE='22023';
END
$write$;
REVOKE ALL ON FUNCTION public.registry_admin_member_write_v1(text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registry_admin_member_write_v1(text,jsonb)
  TO authenticated;

ROLLBACK;
