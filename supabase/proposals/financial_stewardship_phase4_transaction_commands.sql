-- Phase 4 TEST transaction entrypoints. Authorize with live DB staff grants.
-- SECURITY DEFINER bodies remain inside nonexposed fs_internal;
-- public SECURITY INVOKER wrappers expose only narrowly checked actions.
-- No staff grants, bank accounts or live receipts are provisioned here.
create function fs_internal.post_verified_qr_payment(p_claim_id uuid,p_bank_credit_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.fs_payment_claims%rowtype;
  v_credit public.fs_bank_credits%rowtype;
  v_request public.fs_payment_requests%rowtype;
  v_paid bigint;
  v_collection uuid;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not fs_internal.has_staff_role('cowl_finance_verifier') then
    raise exception 'Finance verifier authorization required' using errcode='42501';
  end if;
  select * into strict v_claim from public.fs_payment_claims where id=p_claim_id for update;
  if v_claim.status not in ('submitted','under_review','needs_clarification') then
    raise exception 'This payment claim is not available for verification';
  end if;
  if v_claim.submitted_by=v_actor then
    raise exception 'Payer cannot verify own claim';
  end if;
  select * into strict v_credit from public.fs_bank_credits
    where id=p_bank_credit_id for update;
  if v_claim.receiving_account_id<>v_credit.receiving_account_id
     or upper(v_claim.provider_name)<>upper(v_credit.provider_name)
     or v_claim.normalized_external_reference<>v_credit.normalized_external_reference
     or v_claim.claimed_amount_centavos<>v_credit.amount_centavos then
    raise exception 'Bank credit does not match claimed account, reference, provider and exact amount';
  end if;
  if not exists (select 1 from public.fs_receiving_accounts a
    where a.id=v_credit.receiving_account_id and a.status='approved'
      and a.purpose='cowl_collections') then
    raise exception 'Receiving account is not authorized for COWL collections';
  end if;
  if not exists (select 1 from public.fs_submission_documents d
    join public.fs_payment_requests p on p.id=v_claim.payment_request_id
    where d.id=v_claim.proof_document_id and d.batch_id=p.batch_id
      and d.document_kind='payment_evidence' and d.scan_status='clean') then
    raise exception 'Proof document has not been screened or does not belong to the obligation';
  end if;
  if exists (select 1 from public.fs_collections c where c.bank_credit_id=p_bank_credit_id) then
    raise exception 'Bank credit has already been posted to a collection';
  end if;
  select * into strict v_request from public.fs_payment_requests
     where id=v_claim.payment_request_id for update;
  if v_request.status not in ('quoted','awaiting_payment','part_paid') then
    raise exception 'Payment request cannot accept another payment';
  end if;
  select coalesce(sum(amount_centavos),0)::bigint into v_paid
    from public.fs_collections where payment_request_id=v_request.id and status='posted';
  if v_paid+v_credit.amount_centavos>v_request.total_due_centavos then
    raise exception 'Verified funds exceed remaining approved quote; investigate adjustment';
  end if;
  insert into public.fs_payment_reconciliations
    (claim_id,bank_credit_id,decision,verified_amount_centavos,reviewed_by)
    values (v_claim.id,v_credit.id,'verified',v_credit.amount_centavos,v_actor);
  insert into public.fs_collections
    (internal_reference,payment_request_id,collection_channel,amount_centavos,
     payment_claim_id,bank_credit_id,received_by,received_at)
    values ('COL-'||pg_catalog.replace(gen_random_uuid()::text,'-',''),
      v_request.id,'qr_ph',v_credit.amount_centavos,v_claim.id,v_credit.id,
      v_actor,v_credit.credited_at)
    returning id into v_collection;
  update public.fs_payment_claims set status='verified',reviewed_by=v_actor,
    reviewed_at=now() where id=v_claim.id;
  update public.fs_payment_requests set
    status=case when v_paid+v_credit.amount_centavos=v_request.total_due_centavos
      then 'paid' else 'part_paid' end where id=v_request.id;
  insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
    values ('collection',v_collection,'verified_qr_posted',v_actor,
      pg_catalog.jsonb_build_object('claim_id',v_claim.id,'credit_id',v_credit.id));
  return v_collection;
exception when no_data_found then
  raise exception 'Payment claim, credit or payment request does not exist';
end; $$;

create function fs_internal.post_counted_otc_payment(
  p_payment_request_id uuid,p_amount_centavos bigint,p_counted_at timestamptz,
  p_cash_physically_counted boolean
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
 v_request public.fs_payment_requests%rowtype;
 v_paid bigint;
 v_collection uuid;
 v_actor uuid := (select auth.uid());
begin
 if v_actor is null or not fs_internal.has_staff_role('cowl_finance_verifier') then
   raise exception 'Finance verifier authorization required' using errcode='42501';
 end if;
 if not coalesce(p_cash_physically_counted,false) then
   raise exception 'Actual OTC cash count must be attested';
 end if;
 if p_amount_centavos is null or p_amount_centavos<=0
    or p_counted_at is null or p_counted_at>now()+interval '1 day' then
   raise exception 'Invalid cash amount or count timestamp';
 end if;
 select * into strict v_request from public.fs_payment_requests
   where id=p_payment_request_id for update;
 if v_request.status not in ('quoted','awaiting_payment','part_paid') then
    raise exception 'Payment request cannot accept another payment';
 end if;
 select coalesce(sum(amount_centavos),0)::bigint into v_paid from public.fs_collections
   where payment_request_id=v_request.id and status='posted';
 if v_paid+p_amount_centavos>v_request.total_due_centavos then
   raise exception 'Cash exceeds remaining approved quote';
 end if;
 insert into public.fs_collections
   (internal_reference,payment_request_id,collection_channel,
    amount_centavos,received_by,received_at)
   values ('COL-'||pg_catalog.replace(gen_random_uuid()::text,'-',''),
     v_request.id,'otc',p_amount_centavos,v_actor,p_counted_at)
   returning id into v_collection;
 update public.fs_payment_requests set
   status=case when v_paid+p_amount_centavos=v_request.total_due_centavos
     then 'paid' else 'part_paid' end where id=v_request.id;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
   values ('collection',v_collection,'counted_otc_posted',v_actor,
     pg_catalog.jsonb_build_object('counted_at',p_counted_at));
 return v_collection;
exception when no_data_found then
 raise exception 'Payment request not found';
end; $$;

create function fs_internal.issue_preprinted_receipt(
 p_collection_id uuid,p_receipt_number_id uuid,p_paper_checked boolean,
 p_issue_date date,p_payer_written text,p_ministry_written text,p_code_written text
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_collection public.fs_collections%rowtype;
 v_number public.fs_receipt_numbers%rowtype;
 v_booklet public.fs_receipt_booklets%rowtype;
 v_issue uuid;
begin
 if v_actor is null or not fs_internal.has_staff_role('cowl_receipt_issuer') then
    raise exception 'COWL receipt issuer authorization required' using errcode='42501';
 end if;
 if not coalesce(p_paper_checked,false) or p_issue_date is null then
    raise exception 'Check exact physical preprinted receipt and issue date';
 end if;
 select * into strict v_collection from public.fs_collections
   where id=p_collection_id for update;
 if v_collection.status<>'posted' then raise exception 'Collection is not posted'; end if;
 if exists(select 1 from public.fs_receipt_issues where collection_id=p_collection_id) then
   raise exception 'Collection already has an issued official receipt';
 end if;
 select * into strict v_number from public.fs_receipt_numbers
   where id=p_receipt_number_id for update;
 select * into strict v_booklet from public.fs_receipt_booklets
   where id=v_number.booklet_id for update;
 if v_booklet.custody_state<>'cowl_custody' or v_number.status<>'available' then
    raise exception 'Printed receipt is unavailable or not acknowledged in COWL custody';
 end if;
 update public.fs_receipt_numbers set status='issued' where id=v_number.id;
 insert into public.fs_receipt_issues(
   receipt_number_id,collection_id,issue_date,payer_written_name,
   ministry_written_name,printed_accounting_code,amount_centavos,issued_by)
 values (v_number.id,v_collection.id,p_issue_date,p_payer_written,
    p_ministry_written,p_code_written,v_collection.amount_centavos,v_actor)
 returning id into v_issue;
 insert into public.fs_receipt_issue_lines
   (receipt_issue_id,description,amount_centavos,line_no)
 values (v_issue,'Collection (paper line-item transcription pending)',
    v_collection.amount_centavos,1);
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
 values ('receipt_issue',v_issue,'preprinted_receipt_issued',v_actor,
   pg_catalog.jsonb_build_object('receipt_number_id',v_number.id,'collection_id',v_collection.id));
 return v_issue;
exception when no_data_found then
 raise exception 'Collection, printed receipt or booklet not found';
end; $$;

-- Private functions: no ability for anonymous or unapproved users to execute.
revoke all on function fs_internal.post_verified_qr_payment(uuid,uuid)
  from public,anon;
revoke all on function fs_internal.post_counted_otc_payment(uuid,bigint,timestamptz,boolean)
  from public,anon;
revoke all on function fs_internal.issue_preprinted_receipt(uuid,uuid,boolean,date,text,text,text)
  from public,anon;
grant execute on function fs_internal.post_verified_qr_payment(uuid,uuid)
  to authenticated;
grant execute on function fs_internal.post_counted_otc_payment(uuid,bigint,timestamptz,boolean)
  to authenticated;
grant execute on function fs_internal.issue_preprinted_receipt(uuid,uuid,boolean,date,text,text,text)
  to authenticated;

-- SECURITY INVOKER wrappers live in the Data API schema.
-- The private bodies always verify live DB roles using auth.uid().
create function public.fs_verify_qr_payment(p_claim_id uuid,p_bank_credit_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$
 select fs_internal.post_verified_qr_payment(p_claim_id,p_bank_credit_id);
$$;
create function public.fs_record_otc_payment(p_payment_request_id uuid,
  p_amount_centavos bigint,p_counted_at timestamptz,p_cash_physically_counted boolean)
returns uuid language sql security invoker set search_path = ''
as $$
 select fs_internal.post_counted_otc_payment(
  p_payment_request_id,p_amount_centavos,p_counted_at,p_cash_physically_counted);
$$;
create function public.fs_issue_official_receipt(p_collection_id uuid,
  p_receipt_number_id uuid,p_paper_checked boolean,p_issue_date date,
  p_payer_written text,p_ministry_written text,p_code_written text)
returns uuid language sql security invoker set search_path = ''
as $$
 select fs_internal.issue_preprinted_receipt(
  p_collection_id,p_receipt_number_id,p_paper_checked,p_issue_date,
  p_payer_written,p_ministry_written,p_code_written);
$$;
revoke all on function public.fs_verify_qr_payment(uuid,uuid) from public,anon;
revoke all on function public.fs_record_otc_payment(uuid,bigint,timestamptz,boolean) from public,anon;
revoke all on function public.fs_issue_official_receipt(uuid,uuid,boolean,date,text,text,text) from public,anon;
grant execute on function public.fs_verify_qr_payment(uuid,uuid) to authenticated;
grant execute on function public.fs_record_otc_payment(uuid,bigint,timestamptz,boolean) to authenticated;
grant execute on function public.fs_issue_official_receipt(uuid,uuid,boolean,date,text,text,text) to authenticated;
