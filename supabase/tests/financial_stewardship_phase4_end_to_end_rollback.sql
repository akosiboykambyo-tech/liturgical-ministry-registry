-- PHASE 4 ISOLATED TEST ONLY. Must run with sufficient test DB access.
-- Every fixture and financial event is wrapped in BEGIN/ROLLBACK.
-- No statement creates actual collections, paper receipts or roles persistently.
begin;
do $fixture$
declare
 ids uuid[]; actor_cowl uuid; actor_payer uuid; actor_curia uuid;
 p uuid; m uuid; b uuid; fee uuid; payment uuid; acct uuid;
 document uuid; claim uuid; credit uuid; series uuid; booklet uuid; paper uuid;
begin
 select array_agg(id order by id) into ids from auth.users;
 if array_length(ids,1)<3 then raise exception 'Isolated test requires at least 3 Auth users'; end if;
 actor_cowl:=ids[1];actor_payer:=ids[2];actor_curia:=ids[3];
 perform set_config('fs_smoke.cowl',actor_cowl::text,true);
 perform set_config('fs_smoke.curia',actor_curia::text,true);
 select id into p from public.fs_parishes order by canonical_name limit 1;
 select id into m from public.fs_ministries order by canonical_name limit 1;
 insert into public.fs_staff_grants(user_id,role_code,granted_by) values
  (actor_cowl,'cowl_finance_verifier',actor_curia),
  (actor_cowl,'cowl_receipt_issuer',actor_curia),
  (actor_cowl,'cowl_remittance_preparer',actor_curia),
  (actor_curia,'curia_treasury_reviewer',actor_curia);
 insert into public.fs_parish_contacts(parish_id,user_id,contact_slot,approved_by)
 values(p,actor_payer,1,actor_curia);
 insert into public.fs_renewal_batches(
  renewal_reference,parish_id,ministry_id,service_year,origin,submitted_by)
 values('REN-ROLLBACK-SMOKE-2026',p,m,2026,'parish_self_service',actor_payer)
 returning id into b;
 insert into public.fs_fee_schedules(
  ministry_id,service_year,version,rate_centavos,status,approved_by,approved_at)
 values(m,2026,1,5000,'approved',actor_curia,now())
 returning id into fee;
 insert into public.fs_payment_requests(
  payment_reference,batch_id,fee_schedule_id,quoted_participants,total_due_centavos,issued_by)
 values('PAY-ROLLBACK-SMOKE-2026',b,fee,2,10000,actor_cowl)
 returning id into payment;
 perform set_config('fs_smoke.payment',payment::text,true);
 insert into public.fs_receiving_accounts(
  internal_name,beneficiary_name,institution_name,provider_name,account_fingerprint,
  status,authorized_by,authorized_at)
 values('ROLLBACK-COWL-BANK','TEST COWL','TEST BANK','TESTBANK',
   'TEST-ROLLBACK-COWL-ACCOUNT','approved',actor_curia,now()) returning id into acct;
 insert into public.fs_submission_documents(
  batch_id,document_kind,storage_path,uploaded_by,scan_status)
 values(b,'payment_evidence','test/rollback/financial-proof.png',actor_payer,'clean')
 returning id into document;
 insert into public.fs_payment_claims(
  payment_request_id,receiving_account_id,provider_name,
  submitted_external_reference,claimed_amount_centavos,claimed_paid_at,
  proof_document_id,submitted_by)
 values(payment,acct,'TESTBANK','QR-PAYER-TXN-2026',10000,now(),document,actor_payer)
 returning id into claim;
 perform set_config('fs_smoke.claim',claim::text,true);
 insert into public.fs_bank_credits(
  receiving_account_id,provider_name,bank_external_reference,amount_centavos,
  credited_at,recorded_by,verified_at,bank_evidence_path)
 values(acct,'TESTBANK','QR-PAYER-TXN-2026',10000,now(),actor_cowl,
   now(),'test/rollback/verified-statement.pdf') returning id into credit;
 perform set_config('fs_smoke.credit',credit::text,true);
 insert into public.fs_receipt_series(issuing_entity,series_code,approved_by)
 values('TEST CURIA ONLY','ROLLBACK-SERIES',actor_curia) returning id into series;
 insert into public.fs_receipt_booklets(
  booklet_reference,series_id,first_printed_no,last_printed_no,custody_state,
  registered_by,assigned_to,acknowledged_by,acknowledged_at)
 values('ROLLBACK-RECEIPTS',series,'778801','778802','cowl_custody',
   actor_curia,actor_cowl,actor_cowl,now()) returning id into booklet;
 insert into public.fs_receipt_numbers(booklet_id,series_id,printed_no)
 values(booklet,series,'778801') returning id into paper;
 perform set_config('fs_smoke.paper',paper::text,true);
end $fixture$;
set local role authenticated;
do $smoke$
declare
 cowl uuid:=current_setting('fs_smoke.cowl')::uuid;
 curia uuid:=current_setting('fs_smoke.curia')::uuid;
 payment uuid:=current_setting('fs_smoke.payment')::uuid;
 claim uuid:=current_setting('fs_smoke.claim')::uuid;
 credit uuid:=current_setting('fs_smoke.credit')::uuid;
 paper uuid:=current_setting('fs_smoke.paper')::uuid;
 collection uuid; receipt uuid; remit uuid; funds uuid; review uuid;
 valid_lines jsonb:='[{"description":"Test renewal","participant_count":2,"fee_centavos":5000,"amount_centavos":10000}]'::jsonb;
 invalid_lines jsonb:='[{"description":"Test renewal","participant_count":2,"fee_centavos":5000,"amount_centavos":9000}]'::jsonb;
begin
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.fs_verify_qr_payment(claim,credit);
  raise exception 'FAIL unauthorized payment';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',cowl::text,true);
 collection:=public.fs_verify_qr_payment(claim,credit);
 if collection is null or (select status from public.fs_payment_requests where id=payment)<>'paid' then
   raise exception 'FAIL verified QR payment state';
 end if;
 begin
  perform public.fs_verify_qr_payment(claim,credit);
  raise exception 'FAIL duplicated payer bank credit';
 exception when raise_exception then
   if sqlerrm like 'FAIL%' then raise; end if;
 end;
 begin
  perform public.fs_issue_official_receipt(
   collection,paper,true,current_date,'Test Parish','Test Ministry',null,invalid_lines);
  raise exception 'FAIL invalid printed amount accepted';
 exception when raise_exception then
   if sqlerrm like 'FAIL%' then raise; end if;
 end;
 if (select status from public.fs_receipt_numbers where id=paper)<>'available' then
   raise exception 'FAIL invalid paper form consumed receipt';
 end if;
 receipt:=public.fs_issue_official_receipt(
   collection,paper,true,current_date,'Test Parish','Test Ministry','UNINTERPRETED',valid_lines);
 if (select amount_centavos from public.fs_receipt_issues where id=receipt)<>10000
   or (select count(*) from public.fs_receipt_issue_lines where receipt_issue_id=receipt)<>1
   or (select status from public.fs_receipt_numbers where id=paper)<>'issued' then
   raise exception 'FAIL paper receipt integrity';
 end if;
 begin
  perform public.fs_issue_official_receipt(
   collection,paper,true,current_date,'Test Parish','Test Ministry',null,valid_lines);
  raise exception 'FAIL reused printed receipt';
 exception when raise_exception then
   if sqlerrm like 'FAIL%' then raise; end if;
 end;
 remit:=public.fs_submit_cowl_remittance(
   array[collection],'bank_transfer','COWL-CURIA-TXN-2026',now(),true);
 begin
  perform public.fs_submit_cowl_remittance(
   array[collection],'bank_transfer','COWL-CURIA-TXN-DUPLICATE',now(),true);
  raise exception 'FAIL double COWL remittance';
 exception when raise_exception then
   if sqlerrm like 'FAIL%' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub',curia::text,true);
 funds:=public.fs_record_curia_received_funds(
   remit,'bank_transfer',10000,'COWL-CURIA-TXN-2026',
   'TEST-CURIA-ACCOUNT',now(),'test/rollback/curia-bank-statement.pdf');
 begin
  perform public.fs_complete_curia_review(remit,funds,'confirmed','CURIA-ACK-TEST',null);
  raise exception 'FAIL Curia confirmation without paper duplicate';
 exception when raise_exception then
   if sqlerrm like 'FAIL%' then raise; end if;
 end;
 perform public.fs_verify_curia_receipt_copy(remit,receipt,true);
 review:=public.fs_complete_curia_review(remit,funds,'confirmed','CURIA-ACK-TEST',null);
 if review is null or (select status from public.fs_remittances where id=remit)<>'curia_confirmed' then
   raise exception 'FAIL Curia confirmation';
 end if;
end $smoke$;
rollback;