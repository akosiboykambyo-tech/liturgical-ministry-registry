-- RC1 TEST-only synthetic financial lifecycle test, 20 November 2026
-- ONLY run against Supabase project rtptybxugjhvpfjvcvgw (Ministry-Registry-Test).
-- Each statement runs within ONE transaction ending ROLLBACK; any error rolls it back.
-- No real bank transfer, cash count, receipt printing, physical handover, or signature
-- was performed. Boolean attestation values below simulate only the software branches
-- for fictional, never-persisted stock and values.
--
-- Operator explicitly approved disposable TEST fixture testing.
-- Three operator_authorized_test role grant rows are created *inside* this
-- uncommitted transaction and are never visible as persisted account permissions.
-- DO NOT RUN ON PRODUCTION. DO NOT CHANGE ROLLBACK TO COMMIT.
BEGIN;

DO $fixture$
DECLARE
  v_cowl uuid;
  v_curia uuid;
  v_parish uuid;
  v_ministry uuid;
  v_fee uuid;
  v_batch uuid;
  v_request uuid;
  v_ref text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
BEGIN
  SELECT g.user_id INTO v_cowl FROM public.fs_staff_grants g
  JOIN auth.users u ON u.id = g.user_id
  WHERE g.role_code = 'cowl_receipt_issuer' AND g.revoked_at IS NULL
    AND g.granted_at <= now() AND (g.expires_at IS NULL OR g.expires_at > now())
  LIMIT 1;
  SELECT g.user_id INTO v_curia FROM public.fs_staff_grants g
  JOIN auth.users u ON u.id = g.user_id
  WHERE g.role_code = 'curia_receipt_custodian' AND g.revoked_at IS NULL
    AND g.granted_at <= now() AND (g.expires_at IS NULL OR g.expires_at > now())
  LIMIT 1;
  SELECT id INTO v_parish FROM public.fs_parishes WHERE active ORDER BY id LIMIT 1;
  SELECT id INTO v_ministry FROM public.fs_ministries WHERE active ORDER BY id LIMIT 1;
  IF v_cowl IS NULL OR v_curia IS NULL OR v_cowl = v_curia
     OR v_parish IS NULL OR v_ministry IS NULL THEN
    RAISE EXCEPTION 'Required TEST-only roles or reference catalog absent';
  END IF;
  PERFORM set_config('rc1.fixture_cowl', v_cowl::text, true);
  PERFORM set_config('rc1.fixture_curia', v_curia::text, true);
  INSERT INTO public.fs_staff_grants
    (user_id, role_code, provisioning_method, authorization_reference)
  VALUES
    (v_cowl, 'cowl_finance_verifier', 'operator_authorized_test',
      'RC1 2026-11-20 explicitly approved, single transaction, ROLLBACK only'),
    (v_cowl, 'cowl_remittance_preparer', 'operator_authorized_test',
      'RC1 2026-11-20 explicitly approved, single transaction, ROLLBACK only'),
    (v_curia, 'curia_treasury_reviewer', 'operator_authorized_test',
      'RC1 2026-11-20 explicitly approved, single transaction, ROLLBACK only');
  INSERT INTO public.fs_fee_schedules
    (ministry_id,service_year,version,rate_centavos,status,approved_by,approved_at)
  VALUES (v_ministry,2026,1,2500,'approved',v_curia,now())
  RETURNING id INTO v_fee;
  INSERT INTO public.fs_renewal_batches
    (renewal_reference,parish_id,ministry_id,service_year,kind,origin,
     submitted_by,status,reviewed_by,reviewed_at)
  VALUES ('RC1-ROLLBACK-' || v_ref,v_parish,v_ministry,2026,'original',
    'staff',v_cowl,'approved',v_curia,now())
  RETURNING id INTO v_batch;
  INSERT INTO public.fs_payment_requests
    (payment_reference,batch_id,quote_version,fee_schedule_id,
     quoted_participants,total_due_centavos,status,issued_by)
  VALUES ('RC1-PAY-' || v_ref,v_batch,1,v_fee,2,5000,'quoted',v_cowl)
  RETURNING id INTO v_request;
  PERFORM set_config('rc1.fixture_request', v_request::text, true);
END
$fixture$;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $workflow$
DECLARE
  v_cowl uuid := current_setting('rc1.fixture_cowl')::uuid;
  v_curia uuid := current_setting('rc1.fixture_curia')::uuid;
  v_request uuid := current_setting('rc1.fixture_request')::uuid;
  v_series uuid;
  v_booklet uuid;
  v_printed uuid;
  v_collection uuid;
  v_receipt uuid;
  v_remittance uuid;
  v_funds uuid;
  v_review uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_curia::text, true);
  IF NOT fs_internal.has_staff_role('curia_receipt_custodian')
     OR NOT fs_internal.has_staff_role('curia_treasury_reviewer') THEN
     RAISE EXCEPTION 'TEST Curia roles not active in transaction';
  END IF;
  v_series := public.fs_curia_register_receipt_series(
    'RC1 FICTIONAL TEST ENTITY',
    'RC1QA-' || substr(replace(gen_random_uuid()::text,'-',''),1,9));
  v_booklet := public.fs_curia_register_checked_booklet(
    v_series,'RC1 ROLLBACK-ONLY PAPER SIMULATION','0001','0005',true);
  PERFORM public.fs_curia_assign_receipt_booklet(v_booklet,v_cowl,true);

  PERFORM set_config('request.jwt.claim.sub', v_cowl::text, true);
  IF NOT fs_internal.has_staff_role('cowl_receipt_issuer')
     OR NOT fs_internal.has_staff_role('cowl_finance_verifier')
     OR NOT fs_internal.has_staff_role('cowl_remittance_preparer') THEN
     RAISE EXCEPTION 'TEST COWL roles not active in transaction';
  END IF;
  PERFORM public.fs_cowl_acknowledge_receipt_booklet(v_booklet,true);
  v_collection := public.fs_record_otc_payment(v_request,5000,now(),true);
  SELECT n.id INTO v_printed FROM public.fs_receipt_numbers n
   WHERE n.booklet_id=v_booklet AND n.printed_no='0001';
  IF v_printed IS NULL THEN RAISE EXCEPTION 'Synthetic receipt number absent'; END IF;
  v_receipt := public.fs_issue_official_receipt(
    v_collection,v_printed,true,current_date,
    'RC1 SYNTHETIC PAYER','RC1 SYNTHETIC MINISTRY','RC1-NOT-REAL',
    jsonb_build_array(jsonb_build_object(
      'description','RC1 ROLLBACK TEST ONLY','participant_count',2,
      'fee_centavos',2500,'amount_centavos',5000)));
  v_remittance := public.fs_submit_cowl_remittance(
    ARRAY[v_collection],'cash_handover',NULL,now(),true);

  PERFORM set_config('request.jwt.claim.sub', v_curia::text, true);
  v_funds := public.fs_record_curia_received_funds(
    v_remittance,'cash_handover',5000,NULL,NULL,now(),NULL);
  PERFORM public.fs_verify_curia_receipt_copy(v_remittance,v_receipt,true);
  v_review := public.fs_complete_curia_review(
    v_remittance,v_funds,'confirmed','RC1-QA-ACK-SYNTHETIC',NULL);
  PERFORM set_config('rc1.fixture_booklet',v_booklet::text,true);
  PERFORM set_config('rc1.fixture_collection',v_collection::text,true);
  PERFORM set_config('rc1.fixture_receipt',v_receipt::text,true);
  PERFORM set_config('rc1.fixture_remittance',v_remittance::text,true);
  PERFORM set_config('rc1.fixture_review',v_review::text,true);
END
$workflow$;

RESET ROLE;
DO $assert$
DECLARE
  v_request uuid:=current_setting('rc1.fixture_request')::uuid;
  v_booklet uuid:=current_setting('rc1.fixture_booklet')::uuid;
  v_collection uuid:=current_setting('rc1.fixture_collection')::uuid;
  v_receipt uuid:=current_setting('rc1.fixture_receipt')::uuid;
  v_remittance uuid:=current_setting('rc1.fixture_remittance')::uuid;
  v_review uuid:=current_setting('rc1.fixture_review')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.fs_payment_requests p
      WHERE p.id=v_request AND p.status='paid') <> 1
  THEN RAISE EXCEPTION 'Approved synthetic quote not paid'; END IF;
  IF (SELECT count(*) FROM public.fs_collections c
      WHERE c.id=v_collection AND c.amount_centavos=5000 AND c.status='posted')<>1
  THEN RAISE EXCEPTION 'Synthetic OTC collection missing'; END IF;
  IF (SELECT count(*) FROM public.fs_receipt_booklets b
      WHERE b.id=v_booklet AND b.custody_state='cowl_custody')<>1
  THEN RAISE EXCEPTION 'Receipt-book custody transition incomplete'; END IF;
  IF (SELECT count(*) FROM public.fs_receipt_issues i
      WHERE i.id=v_receipt AND i.collection_id=v_collection AND i.amount_centavos=5000)<>1
  THEN RAISE EXCEPTION 'Synthetic official receipt missing'; END IF;
  IF (SELECT count(*) FROM public.fs_receipt_numbers n
      JOIN public.fs_receipt_issues i ON i.receipt_number_id=n.id
      WHERE i.id=v_receipt AND n.status='issued')<>1
  THEN RAISE EXCEPTION 'Preprinted synthetic receipt not marked issued'; END IF;
  IF (SELECT count(*) FROM public.fs_remittances r
      WHERE r.id=v_remittance AND r.status='curia_confirmed'
        AND r.declared_amount_centavos=5000)<>1
  THEN RAISE EXCEPTION 'Synthetic remittance not Curia-confirmed'; END IF;
  IF (SELECT count(*) FROM public.fs_duplicate_copy_handoffs d
      WHERE d.remittance_id=v_remittance AND d.status='curia_verified')<>1
  THEN RAISE EXCEPTION 'Simulated duplicate receipt inspection missing'; END IF;
  IF (SELECT count(*) FROM public.fs_curia_fund_receipts f
      WHERE f.remittance_id=v_remittance AND f.amount_centavos=5000)<>1
  THEN RAISE EXCEPTION 'Simulated Curia cash receipt missing'; END IF;
  IF (SELECT count(*) FROM public.fs_curia_reviews r
      WHERE r.id=v_review AND r.remittance_id=v_remittance AND r.decision='confirmed')<>1
  THEN RAISE EXCEPTION 'Curia independent review not confirmed'; END IF;
  IF (SELECT count(*) FROM public.fs_audit_events a
      WHERE (a.entity_kind='collection' AND a.entity_id=v_collection)
         OR (a.entity_kind='receipt_issue' AND a.entity_id=v_receipt)
         OR (a.entity_kind='remittance' AND a.entity_id=v_remittance)
         OR (a.entity_kind='curia_review' AND a.entity_id=v_review))<4
  THEN RAISE EXCEPTION 'Immutable audit evidence missing'; END IF;
END
$assert$;

-- Essential: no role grants, fictional money, receipt stock, fees, collections,
-- bank assertions, reviews, or audit records persist.
ROLLBACK;
