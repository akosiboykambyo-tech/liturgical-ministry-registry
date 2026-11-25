
-- TEST only. Synthetic evidence metadata is not a scanned upload or a bank connection.
create function fs_internal.rc2_demo_opening_serials(p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text,p_issued text[],p_voided text[],p_missing text[],p_checked boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); b uuid; all_used text[]; n text; total integer;
begin
 if actor is null or not exists(select 1 from public.fs_staff_grants where user_id=actor and role_code='curia_receipt_custodian' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now())) then raise exception 'Curia custodian required' using errcode='42501'; end if;
 if not coalesce(p_checked,false) or p_booklet_reference is null or p_booklet_reference !~ '^DEMO-[A-Z0-9-]{1,45}$' or not exists(select 1 from public.fs_receipt_series where id=p_series_id and series_code like 'DEMO-%') then raise exception 'Checked fictional demo series and booklet required'; end if;
 if p_first_no is null or p_last_no is null or p_first_no !~ '^[0-9]{4,12}$' or p_last_no !~ '^[0-9]{4,12}$' or length(p_first_no)<>length(p_last_no) then raise exception 'Invalid serial range'; end if;
 if p_last_no::numeric-p_first_no::numeric not between 0 and 499 then raise exception 'Invalid range'; end if;
 total:=(p_last_no::numeric-p_first_no::numeric+1)::int;
 all_used:=coalesce(p_issued,array[]::text[])||coalesce(p_voided,array[]::text[])||coalesce(p_missing,array[]::text[]);
 if cardinality(all_used)>total or cardinality(all_used)<>(select count(distinct x) from unnest(all_used) x) then raise exception 'Duplicate or excessive opening serials'; end if;
 foreach n in array all_used loop
  if n is null or n !~ '^[0-9]{4,12}$' or length(n)<>length(p_first_no) then raise exception 'Use exact printed serials including leading zeros'; end if;
  if n::numeric not between p_first_no::numeric and p_last_no::numeric then raise exception 'Opening serial outside booklet range'; end if;
 end loop;
 b:=fs_internal.curia_register_booklet(p_series_id,p_booklet_reference,p_first_no,p_last_no);
 update public.fs_receipt_numbers set status=case when printed_no=any(coalesce(p_issued,array[]::text[])) then 'previously_issued' when printed_no=any(coalesce(p_voided,array[]::text[])) then 'previously_voided' else 'missing' end where booklet_id=b and printed_no=any(all_used);
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata) values('receipt_booklet',b,'demo_opening_serials_reconciled',actor,jsonb_build_object('previously_issued',coalesce(cardinality(p_issued),0),'previously_voided',coalesce(cardinality(p_voided),0),'missing',coalesce(cardinality(p_missing),0),'available',total-cardinality(all_used)));
 return b;
end $$;
create function public.fs_demo_register_opening_serials(p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text,p_issued text[],p_voided text[],p_missing text[],p_checked boolean) returns uuid language sql security invoker set search_path='' as $$ select fs_internal.rc2_demo_opening_serials(p_series_id,p_booklet_reference,p_first_no,p_last_no,p_issued,p_voided,p_missing,p_checked); $$;
revoke all on function fs_internal.rc2_demo_opening_serials(uuid,text,text,text,text[],text[],text[],boolean), public.fs_demo_register_opening_serials(uuid,text,text,text,text[],text[],text[],boolean) from public,anon;
grant execute on function fs_internal.rc2_demo_opening_serials(uuid,text,text,text,text[],text[],text[],boolean), public.fs_demo_register_opening_serials(uuid,text,text,text,text[],text[],text[],boolean) to authenticated;
create function fs_internal.rc2_demo_qr_rehearsal() returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ref text; req uuid; batch uuid; account uuid; doc uuid; claim uuid; amt bigint;
begin
 if actor is null or not exists(select 1 from public.fs_staff_grants where user_id=actor and role_code='curia_receipt_custodian' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now())) then raise exception 'Curia custodian required' using errcode='42501'; end if;
 ref:=fs_internal.rc2_new_rehearsal();
 select id,batch_id,total_due_centavos into strict req,batch,amt from public.fs_payment_requests where payment_reference=ref||'-PAY';
 insert into public.fs_receiving_accounts(internal_name,beneficiary_name,institution_name,provider_name,account_fingerprint,purpose,status,authorized_by,authorized_at)
 values(ref||'-SIMULATED-ACCOUNT','DEMONSTRATION ONLY','Fictional bank — no account','DEMO BANK',ref||'-NONPAYABLE','cowl_collections','approved',actor,now()) returning id into account;
 insert into public.fs_submission_documents(batch_id,document_kind,storage_path,original_name,uploaded_by,scan_status)
 values(batch,'payment_evidence','demo-metadata-only/'||ref,'DEMONSTRATION ONLY — simulated proof (no file)',actor,'clean') returning id into doc;
 insert into public.fs_payment_claims(payment_request_id,receiving_account_id,provider_name,submitted_external_reference,claimed_amount_centavos,claimed_paid_at,proof_document_id,submitted_by)
 values(req,account,'DEMO BANK',ref||'-QR',amt,now(),doc,actor) returning id into claim;
 insert into public.fs_bank_credits(receiving_account_id,provider_name,bank_external_reference,amount_centavos,credited_at,statement_batch_reference,recorded_by,verified_at)
 values(account,'DEMO BANK',ref||'-QR',amt,now(),'DEMO SYNTHETIC MATCH',actor,now()),(account,'DEMO BANK',ref||'-MISMATCH',amt+100,now(),'DEMO SYNTHETIC MISMATCH',actor,now());
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata) values('payment_claim',claim,'demo_qr_evidence_created',actor,jsonb_build_object('synthetic_metadata_only',true,'reference',ref));
 return ref;
end $$;
create function public.fs_demo_create_qr_rehearsal() returns text language sql security invoker set search_path='' as $$select fs_internal.rc2_demo_qr_rehearsal();$$;
revoke all on function fs_internal.rc2_demo_qr_rehearsal(),public.fs_demo_create_qr_rehearsal() from public,anon;
grant execute on function fs_internal.rc2_demo_qr_rehearsal(),public.fs_demo_create_qr_rehearsal() to authenticated;
create function fs_internal.rc2_demo_audit() returns table(event_id bigint,event_time timestamptz,event_kind text,event_action text,reference text) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.fs_staff_grants where user_id=auth.uid() and role_code in ('cowl_remittance_preparer','curia_treasury_reviewer') and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now())) then raise exception 'Financial reporting role required' using errcode='42501'; end if;
 return query select a.id,a.happened_at,a.entity_kind,a.action,coalesce(b.booklet_reference,p.payment_reference,c.internal_reference,r.remittance_reference,pc.submitted_external_reference,i.id::text,n.printed_no) from public.fs_audit_events a
 left join public.fs_receipt_booklets b on a.entity_kind='receipt_booklet' and b.id=a.entity_id
 left join public.fs_payment_requests p on a.entity_kind='payment_request' and p.id=a.entity_id
 left join public.fs_collections c on a.entity_kind='collection' and c.id=a.entity_id
 left join public.fs_remittances r on a.entity_kind='remittance' and r.id=a.entity_id
 left join public.fs_payment_claims pc on a.entity_kind='payment_claim' and pc.id=a.entity_id
 left join public.fs_receipt_issues i on a.entity_kind='receipt_issue' and i.id=a.entity_id
 left join public.fs_receipt_numbers n on a.entity_kind='receipt_number' and n.id=a.entity_id
 where b.booklet_reference like 'DEMO-%' or p.payment_reference like 'DEMO-%' or pc.submitted_external_reference like 'DEMO-%'
 or c.payment_request_id in(select id from public.fs_payment_requests where payment_reference like 'DEMO-%')
 or r.id in(select ri.remittance_id from public.fs_remittance_items ri join public.fs_collections co on co.id=ri.collection_id join public.fs_payment_requests pr on pr.id=co.payment_request_id where pr.payment_reference like 'DEMO-%')
 or i.collection_id in(select co.id from public.fs_collections co join public.fs_payment_requests pr on pr.id=co.payment_request_id where pr.payment_reference like 'DEMO-%')
 or n.booklet_id in(select id from public.fs_receipt_booklets where booklet_reference like 'DEMO-%')
 order by a.happened_at desc,a.id desc limit 200;
end $$;
create function public.fs_demo_audit_history() returns table(event_id bigint,event_time timestamptz,event_kind text,event_action text,reference text) language sql stable security invoker set search_path='' as $$select * from fs_internal.rc2_demo_audit();$$;
revoke all on function fs_internal.rc2_demo_audit(),public.fs_demo_audit_history() from public,anon;
grant execute on function fs_internal.rc2_demo_audit(),public.fs_demo_audit_history() to authenticated;
