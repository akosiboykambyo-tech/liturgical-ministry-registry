-- PR55 server-side production renewal RPC compatibility LAB in isolated
-- staging only, fully transactional (BEGIN...ROLLBACK). No permanent tables,
-- triggers, admin function changes, or calls to production.
BEGIN;
DO $safety$
BEGIN
 IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
 OR to_regclass('registry_renewal_lab.members') IS NOT NULL
 OR (SELECT count(*) FROM public.members) <> 1008
 OR (SELECT count(*) FROM public.member_ministries) <> 12
 OR (SELECT count(*) FROM registry_private.registration_administrators
     WHERE active AND revoked_at IS NULL) <> 1
 OR to_regprocedure('registry_private.enforce_member_ministry_year_v1()') IS NULL
 THEN RAISE EXCEPTION 'PR55 renewal lab must run only on isolated staging' USING ERRCODE='42501';
 END IF;
END $safety$;

CREATE SCHEMA registry_renewal_lab;
REVOKE ALL ON SCHEMA registry_renewal_lab FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA registry_renewal_lab TO authenticated;

CREATE TABLE registry_renewal_lab.members(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 uid text NOT NULL,first_name text NOT NULL,last_name text NOT NULL,
 parish text NOT NULL,status text NOT NULL DEFAULT 'Pending Verification',
 expiration_date date,updated_at timestamptz DEFAULT now()
);
CREATE TABLE registry_renewal_lab.member_ministries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES registry_renewal_lab.members(id),
 ministry text NOT NULL,status text NOT NULL DEFAULT 'Pending Verification',
 start_date date,renewal_date date,expiration_date date,
 document_url text,document_uploaded_at timestamptz,
 archived_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE registry_renewal_lab.recommendation_renewal_batches(
 id uuid PRIMARY KEY,parish text NOT NULL,ministry text,
 document_url text NOT NULL,document_uploaded_at timestamptz NOT NULL,
 renewal_date date NOT NULL,next_renewal_date date NOT NULL,
 notes text,processed_by uuid,processed_at timestamptz NOT NULL,
 CONSTRAINT lab_exact_batch_year CHECK(
   next_renewal_date=(renewal_date+interval '1 year')::date)
);
CREATE TABLE registry_renewal_lab.recommendation_renewal_memberships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES registry_renewal_lab.recommendation_renewal_batches(id),
 member_ministry_id uuid,member_id uuid,member_uid text NOT NULL,
 member_name text NOT NULL,parish text NOT NULL,ministry text NOT NULL,
 previous_status text,previous_start_date date,
 previous_expiration_date date,previous_renewal_date date,
 previous_document_url text,result_status text NOT NULL,
 result_expiration_date date NOT NULL,result_renewal_date date NOT NULL,
 result_document_url text NOT NULL,
 CONSTRAINT lab_snapshot_exact_year CHECK(result_status<>'Renewed' OR
   result_expiration_date=(result_renewal_date+interval '1 year')::date)
);

-- TEMPORARY lab-only SELECT and direct-edit privileges to model
-- production's current legacy direct-write exposure (not recommended).
GRANT SELECT ON ALL TABLES IN SCHEMA registry_renewal_lab TO authenticated;
GRANT UPDATE ON registry_renewal_lab.member_ministries TO authenticated;

-- Insert a valid New assignment and a pending second assignment, plus one
-- historical exceptional Renewed assignment BEFORE attaching the guard.
INSERT INTO registry_renewal_lab.members(id,uid,first_name,last_name,parish,status)
VALUES('11111111-1111-4111-8111-111111111111','LAB-A','Synthetic','A','Staging Test Parish','Pending Verification'),
('22222222-2222-4222-8222-222222222222','LAB-B','Synthetic','B','Staging Test Parish','Renewed');
INSERT INTO registry_renewal_lab.member_ministries(
 id,member_id,ministry,status,start_date,renewal_date,expiration_date,document_url)
VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
 'Ministry of Lectors and Commentators','New',date '2025-10-29',NULL,date '2026-10-29','verification/historical.pdf'),
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
 'Ministry of Liturgical Music','Pending Verification',NULL,NULL,NULL,NULL),
('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',
 'Ministry of Lectors and Commentators','Renewed',date '2024-10-29',
 date '2025-10-29',date '2026-09-29','verification/historical.pdf');

CREATE TRIGGER trg_pr55_ministry_one_year
BEFORE INSERT OR UPDATE ON registry_renewal_lab.member_ministries
FOR EACH ROW EXECUTE FUNCTION registry_private.enforce_member_ministry_year_v1();

-- Replace the production fixed-JWT-email check with the same active,
-- revocable and row-locked grant check already used by PR55 in staging.
CREATE OR REPLACE FUNCTION registry_renewal_lab.check_renewal_admin_access()
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
REVOKE ALL ON FUNCTION registry_renewal_lab.check_renewal_admin_access()
FROM PUBLIC, anon, authenticated;



-- Replace the production fixed-JWT-email check with the same active,
-- revocable and row-locked grant check already used by PR55 in staging.
CREATE OR REPLACE FUNCTION registry_renewal_lab.check_renewal_admin_access()
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
REVOKE ALL ON FUNCTION registry_renewal_lab.check_renewal_admin_access()
FROM PUBLIC, anon, authenticated;

-- Keep the existing *8-argument* RPC signature to avoid breaking the app.
-- The client-provided next date is used ONLY to confirm the operator's
-- reviewed date, never as the authoritative stored expiration.
CREATE OR REPLACE FUNCTION registry_renewal_lab.process_recommendation_renewal_batch(
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
 PERFORM registry_renewal_lab.check_renewal_admin_access();

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
 PERFORM 1 FROM registry_renewal_lab.members m
 WHERE m.id IN (
  SELECT mm.member_id FROM registry_renewal_lab.member_ministries mm WHERE mm.id=ANY(v_ids)
 ) ORDER BY m.id FOR UPDATE;

 PERFORM 1 FROM registry_renewal_lab.member_ministries mm
 WHERE mm.id=ANY(v_ids) ORDER BY mm.id FOR UPDATE;
 GET DIAGNOSTICS v_locked=ROW_COUNT;
 IF v_locked<>v_expected THEN
   RAISE EXCEPTION 'Some assignments no longer exist' USING ERRCODE='22023';
 END IF;

 SELECT count(*) INTO v_in_scope
 FROM registry_renewal_lab.member_ministries mm
 JOIN registry_renewal_lab.members m ON m.id=mm.member_id
 WHERE mm.id=ANY(v_ids) AND m.parish=btrim(p_parish)
   AND (NULLIF(btrim(p_ministry),'') IS NULL OR mm.ministry=btrim(p_ministry))
   AND mm.status IN ('New','Renewed');
 IF v_in_scope<>v_expected THEN
  RAISE EXCEPTION 'Assignment outside parish/ministry scope or not yet verified'
    USING ERRCODE='22023';
 END IF;

 INSERT INTO registry_renewal_lab.recommendation_renewal_batches(
  id,parish,ministry,document_url,document_uploaded_at,renewal_date,
  next_renewal_date,notes,processed_by,processed_at)
 VALUES(p_batch_id,btrim(p_parish),NULLIF(btrim(p_ministry),''),
        p_document_url,v_now,p_renewal_date,v_expires,
        NULLIF(btrim(p_notes),''),v_actor,v_now);

 INSERT INTO registry_renewal_lab.recommendation_renewal_memberships(
  batch_id,member_ministry_id,member_id,member_uid,member_name,parish,ministry,
  previous_status,previous_start_date,previous_expiration_date,
  previous_renewal_date,previous_document_url,
  result_status,result_expiration_date,result_renewal_date,result_document_url)
 SELECT p_batch_id,mm.id,m.id,m.uid,
        btrim(concat_ws(' ',m.first_name,m.last_name)),m.parish,mm.ministry,
        mm.status,mm.start_date,mm.expiration_date,mm.renewal_date,mm.document_url,
        'Renewed',v_expires,p_renewal_date,p_document_url
 FROM registry_renewal_lab.member_ministries mm JOIN registry_renewal_lab.members m ON m.id=mm.member_id
 WHERE mm.id=ANY(v_ids);

 UPDATE registry_renewal_lab.member_ministries mm SET
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
   FROM registry_renewal_lab.member_ministries mm
   WHERE mm.member_id IN (
     SELECT DISTINCT selected.member_id
     FROM registry_renewal_lab.member_ministries selected WHERE selected.id=ANY(v_ids)
   )
   GROUP BY mm.member_id
 )
 UPDATE registry_renewal_lab.members m
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

REVOKE ALL ON FUNCTION registry_renewal_lab.process_recommendation_renewal_batch(
 uuid,text,text,text,date,date,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION registry_renewal_lab.process_recommendation_renewal_batch(
 uuid,text,text,text,date,date,uuid[],text) TO authenticated;



-- Run with actual staging admin claim and PostgreSQL authenticated role,
-- then revoke the claim within this same transaction for permission-denial tests.
DO $set_admin$
DECLARE v_admin uuid;
BEGIN
 SELECT user_id INTO STRICT v_admin
 FROM registry_private.registration_administrators
 WHERE active AND revoked_at IS NULL LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
END $set_admin$;
SET LOCAL ROLE authenticated;

DO $rehearsal$
DECLARE
 v_batch uuid:='66666666-6666-4666-8666-666666666666';
 v_result uuid;v_total int;v_denied boolean;
BEGIN
 -- Unselected pending ministry is never renewed by a batch RPC.
 SELECT registry_renewal_lab.process_recommendation_renewal_batch(
 v_batch,'Staging Test Parish','Ministry of Lectors and Commentators',
 'batch-renewals/synthetic.pdf',date '2026-10-29',date '2027-10-29',
 ARRAY['33333333-3333-4333-8333-333333333333'::uuid],NULL)
 INTO v_result;
 IF v_result<>v_batch THEN RAISE EXCEPTION 'Unexpected returned batch ID'; END IF;

 SELECT count(*) INTO v_total
 FROM registry_renewal_lab.recommendation_renewal_memberships
 WHERE batch_id=v_batch AND result_status='Renewed'
 AND result_renewal_date=date '2026-10-29'
 AND result_expiration_date=date '2027-10-29';
 IF v_total<>1 THEN RAISE EXCEPTION 'Renewal snapshot/year incorrect'; END IF;

 SELECT count(*) INTO v_total
 FROM registry_renewal_lab.member_ministries
 WHERE member_id='11111111-1111-4111-8111-111111111111'
 AND ((id='33333333-3333-4333-8333-333333333333'
       AND status='Renewed' AND expiration_date=date '2027-10-29')
   OR (id='44444444-4444-4444-8444-444444444444'
       AND status='Pending Verification' AND expiration_date IS NULL));
 IF v_total<>2 THEN RAISE EXCEPTION 'Selected/unselected ministry state corrupted'; END IF;

 SELECT count(*) INTO v_total FROM registry_renewal_lab.members
 WHERE id='11111111-1111-4111-8111-111111111111'
 AND status='Pending Verification' AND expiration_date IS NULL;
 IF v_total<>1 THEN RAISE EXCEPTION 'Legacy member summary inconsistent'; END IF;

 -- Existing historical short validity can accept an unrelated metadata edit.
 UPDATE registry_renewal_lab.member_ministries
 SET document_url='verification/unchanged-historical.pdf'
 WHERE id='55555555-5555-4555-8555-555555555555';
 v_denied:=false;
 BEGIN
 UPDATE registry_renewal_lab.member_ministries
 SET expiration_date=date '2026-11-29'
 WHERE id='55555555-5555-4555-8555-555555555555';
 EXCEPTION WHEN check_violation THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Historical invalid row accepted validity change'; END IF;

 -- A client cannot submit an off-by-one next date.
 v_denied:=false;
 BEGIN
 PERFORM registry_renewal_lab.process_recommendation_renewal_batch(
 gen_random_uuid(),'Staging Test Parish','Ministry of Lectors and Commentators',
 'batch-renewals/synthetic.pdf',date '2026-10-29',date '2027-10-30',
 ARRAY['33333333-3333-4333-8333-333333333333'::uuid],NULL);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Tampered next date accepted'; END IF;

 -- A pending ministry cannot be promoted via renewal batch.
 v_denied:=false;
 BEGIN
 PERFORM registry_renewal_lab.process_recommendation_renewal_batch(
 gen_random_uuid(),'Staging Test Parish',NULL,
 'batch-renewals/synthetic.pdf',date '2026-10-29',date '2027-10-29',
 ARRAY['44444444-4444-4444-8444-444444444444'::uuid],NULL);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Pending ministry illegally renewed'; END IF;

 -- Duplicate IDs must be rejected, not silently deduplicated.
 v_denied:=false;
 BEGIN
 PERFORM registry_renewal_lab.process_recommendation_renewal_batch(
 gen_random_uuid(),'Staging Test Parish',NULL,
 'batch-renewals/synthetic.pdf',date '2026-10-29',date '2027-10-29',
 ARRAY['33333333-3333-4333-8333-333333333333'::uuid,
       '33333333-3333-4333-8333-333333333333'::uuid],NULL);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Duplicate membership selection accepted'; END IF;

 -- Nonadministrator cannot call hardened SECURITY DEFINER renewal RPC.
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 v_denied:=false;
 BEGIN
 PERFORM registry_renewal_lab.process_recommendation_renewal_batch(
 gen_random_uuid(),'Staging Test Parish',NULL,'batch-renewals/synthetic.pdf',
 date '2026-10-29',date '2027-10-29',
 ARRAY['33333333-3333-4333-8333-333333333333'::uuid],NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Nonadmin invoked renewal successfully'; END IF;
END $rehearsal$;
RESET ROLE;
SELECT 'PASS: hardened batch RPC, exact-year snapshot, scope, pending preservation, nonadmin denial, historical metadata exception; transaction rolls back' AS result;
ROLLBACK;
