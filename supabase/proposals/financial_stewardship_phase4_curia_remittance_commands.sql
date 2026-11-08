-- Phase 4 TEST ONLY. COWL remittance and independent Curia acceptance.
alter table public.fs_remittances add column fund_transfer_channel text
  check(fund_transfer_channel in ('bank_transfer','cash_handover'));
alter table public.fs_remittances add constraint fs_submitted_transfer_channel_present
  check(status not in ('submitted','curia_confirmed')
    or fund_transfer_channel is not null);

create function fs_internal.submit_cowl_remittance(
 p_collection_ids uuid[],p_channel text,p_transfer_reference text,
 p_transferred_at timestamptz,p_duplicate_copies_checked boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_collection public.fs_collections%rowtype;
 v_issue public.fs_receipt_issues%rowtype;
 v_id uuid;
 v_count int := 0;
 v_total bigint := 0;
begin
 if v_actor is null or not fs_internal.has_staff_role('cowl_remittance_preparer') then
   raise exception 'COWL remittance preparer authorization required' using errcode='42501';
 end if;
 if not coalesce(p_duplicate_copies_checked,false) then
   raise exception 'Physical duplicate copy handover must be attested';
 end if;
 if p_collection_ids is null or pg_catalog.cardinality(p_collection_ids) not between 1 and 1000
    or p_transferred_at is null or p_transferred_at>now()+interval '1 day' then
   raise exception 'Invalid COWL remittance collection list or date';
 end if;
 if p_channel not in ('bank_transfer','cash_handover') then
   raise exception 'Unsupported COWL remittance transfer channel';
 end if;
 if p_channel='bank_transfer' and length(btrim(coalesce(p_transfer_reference,'')))<5 then
   raise exception 'Actual COWL to Curia bank transfer reference required';
 end if;
 if p_channel='cash_handover' and nullif(btrim(coalesce(p_transfer_reference,'')),'') is not null then
   raise exception 'Cash handover must not be presented as a bank reference';
 end if;
 if (select count(distinct x) from unnest(p_collection_ids) x)
   <> pg_catalog.cardinality(p_collection_ids) then
   raise exception 'Repeated collection appears in remittance selection';
 end if;
 -- Lock ALL collection rows before eligibility checks to serialize concurrent submits.
 for v_collection in select c.* from public.fs_collections c
   where c.id=any(p_collection_ids) order by c.id for update
 loop
   v_count:=v_count+1;
   if v_collection.status<>'posted' then
      raise exception 'Only posted collections may be remitted';
   end if;
   if exists(select 1 from public.fs_remittance_items ri
     where ri.collection_id=v_collection.id) then
      raise exception 'Collection has already been assigned to a remittance';
   end if;
   select * into strict v_issue from public.fs_receipt_issues i
     where i.collection_id=v_collection.id;
   if v_issue.amount_centavos<>v_collection.amount_centavos then
      raise exception 'Printed receipt amount does not match posted collection';
   end if;
   v_total:=v_total+v_collection.amount_centavos;
 end loop;
 if v_count<>pg_catalog.cardinality(p_collection_ids) or v_total<=0 then
   raise exception 'Remittance selection contains missing or invalid collections';
 end if;
 insert into public.fs_remittances(
   remittance_reference,declared_amount_centavos,status,prepared_by,submitted_at,
   cowl_to_curia_transfer_reference,cowl_to_curia_transferred_at,fund_transfer_channel)
 values ('REM-'||pg_catalog.replace(gen_random_uuid()::text,'-',''),v_total,
   'submitted',v_actor,now(),
   case when p_channel='bank_transfer' then p_transfer_reference else null end,
   p_transferred_at,p_channel)
 returning id into v_id;
 for v_collection in select c.* from public.fs_collections c
   where c.id=any(p_collection_ids) order by c.id
 loop
   select * into strict v_issue from public.fs_receipt_issues i
    where i.collection_id=v_collection.id;
   insert into public.fs_remittance_items(remittance_id,collection_id,receipt_issue_id)
      values(v_id,v_collection.id,v_issue.id);
   insert into public.fs_duplicate_copy_handoffs(
       remittance_id,receipt_issue_id,status,copy_count,handed_by,handed_at)
      values(v_id,v_issue.id,'submitted',1,v_actor,now());
 end loop;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
 values('remittance',v_id,'cowl_submitted',v_actor,
   pg_catalog.jsonb_build_object('collection_count',v_count,'declared_centavos',v_total));
 return v_id;
exception when no_data_found then
 raise exception 'A selected posted collection lacks an official receipt issue';
end; $$;

create function fs_internal.record_curia_funds(
 p_remittance_id uuid,p_channel text,p_amount_centavos bigint,
 p_external_reference text,p_curia_destination_fingerprint text,
 p_received_at timestamptz,p_curia_statement_evidence_path text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_remit public.fs_remittances%rowtype;
 v_receipt uuid;
begin
 if v_actor is null or not fs_internal.has_staff_role('curia_treasury_reviewer') then
   raise exception 'Curia treasury reviewer authorization required' using errcode='42501';
 end if;
 select * into strict v_remit from public.fs_remittances where id=p_remittance_id for update;
 if v_remit.status<>'submitted' or v_actor=v_remit.prepared_by then
   raise exception 'Curia funds cannot be received or independently checked';
 end if;
 if p_channel<>v_remit.fund_transfer_channel
   or p_amount_centavos is null or p_amount_centavos<0
   or p_received_at is null or p_received_at>now()+interval '1 day' then
   raise exception 'Invalid Curia fund receipt details';
 end if;
 if p_channel='bank_transfer' then
   if length(btrim(coalesce(p_external_reference,'')))<5
      or length(btrim(coalesce(p_curia_destination_fingerprint,'')))<5
      or length(btrim(coalesce(p_curia_statement_evidence_path,'')))<10 then
      raise exception 'Curia independent bank statement evidence is required';
   end if;
   if upper(regexp_replace(v_remit.cowl_to_curia_transfer_reference,
      '[^a-zA-Z0-9]','','g'))
      <>upper(regexp_replace(p_external_reference,
      '[^a-zA-Z0-9]','','g')) then
      raise exception 'Curia bank transfer reference does not match COWL declaration';
   end if;
 else
   if nullif(btrim(coalesce(p_external_reference,'')),'') is not null then
      raise exception 'Cash receipt cannot carry fabricated bank transaction number';
   end if;
 end if;
 insert into public.fs_curia_fund_receipts(
   remittance_id,channel,amount_centavos,external_transfer_reference,
   destination_account_fingerprint,verified_receipt_at,curia_evidence_path,received_by)
 values(p_remittance_id,p_channel,p_amount_centavos,p_external_reference,
   p_curia_destination_fingerprint,p_received_at,p_curia_statement_evidence_path,v_actor)
 returning id into v_receipt;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
 values('curia_fund_receipt',v_receipt,'curia_independent_funds_recorded',v_actor,
   pg_catalog.jsonb_build_object('remittance_id',p_remittance_id,'channel',p_channel));
 return v_receipt;
exception when no_data_found then
 raise exception 'Remittance not found';
end; $$;

create function fs_internal.verify_curia_duplicate(
 p_remittance_id uuid,p_receipt_issue_id uuid,p_physical_copy_examined boolean
) returns void language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_remit public.fs_remittances%rowtype;
 v_copy public.fs_duplicate_copy_handoffs%rowtype;
begin
 if v_actor is null or not fs_internal.has_staff_role('curia_treasury_reviewer') then
   raise exception 'Curia treasury reviewer authorization required' using errcode='42501';
 end if;
 if not coalesce(p_physical_copy_examined,false) then
   raise exception 'Curia must physically inspect the duplicate copy';
 end if;
 select * into strict v_remit from public.fs_remittances where id=p_remittance_id for update;
 if v_remit.status<>'submitted' or v_actor=v_remit.prepared_by then
   raise exception 'Remittance is unavailable for independent review';
 end if;
 select * into strict v_copy from public.fs_duplicate_copy_handoffs
  where remittance_id=p_remittance_id and receipt_issue_id=p_receipt_issue_id for update;
 if v_copy.status<>'submitted' or v_copy.copy_count<>1 then
   raise exception 'Duplicate receipt copy cannot be verified';
 end if;
 update public.fs_duplicate_copy_handoffs
  set status='curia_verified',checked_by=v_actor,checked_at=now()
  where id=v_copy.id;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
 values('duplicate_copy',v_copy.id,'curia_copy_verified',v_actor,
   pg_catalog.jsonb_build_object('remittance_id',p_remittance_id));
exception when no_data_found then
 raise exception 'Remittance or duplicate receipt copy not found';
end; $$;

create function fs_internal.complete_curia_remittance(
 p_remittance_id uuid,p_curia_fund_receipt_id uuid,
 p_decision text,p_ack_reference text,p_discrepancy_notes text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_remit public.fs_remittances%rowtype;
 v_funds public.fs_curia_fund_receipts%rowtype;
 v_copy_total int;
 v_verified_copies int;
 v_collection_sum bigint;
 v_review uuid;
begin
 if v_actor is null or not fs_internal.has_staff_role('curia_treasury_reviewer') then
   raise exception 'Curia treasury reviewer authorization required' using errcode='42501';
 end if;
 select * into strict v_remit from public.fs_remittances where id=p_remittance_id for update;
 if v_remit.status<>'submitted' or v_actor=v_remit.prepared_by then
   raise exception 'Curia cannot confirm a non-submitted or self-prepared remittance';
 end if;
 if p_decision not in ('confirmed','discrepancy') then
   raise exception 'Unsupported Curia decision';
 end if;
 select * into strict v_funds from public.fs_curia_fund_receipts
   where id=p_curia_fund_receipt_id and remittance_id=p_remittance_id for update;
 select coalesce(sum(c.amount_centavos),0)::bigint into v_collection_sum
   from public.fs_remittance_items ri
   join public.fs_collections c on c.id=ri.collection_id
   where ri.remittance_id=p_remittance_id and c.status='posted';
 select count(*)::integer,count(*) filter (where status='curia_verified')::integer
   into v_copy_total,v_verified_copies from public.fs_duplicate_copy_handoffs
   where remittance_id=p_remittance_id;
 if p_decision='confirmed' then
   if length(btrim(coalesce(p_ack_reference,'')))<5 or
      v_funds.amount_centavos<>v_remit.declared_amount_centavos or
      v_collection_sum<>v_remit.declared_amount_centavos or
      v_verified_copies=0 or v_verified_copies<>v_copy_total or
      v_copy_total<>(select count(*) from public.fs_remittance_items where remittance_id=p_remittance_id) then
     raise exception 'Curia confirmation requires matched funds, posted collections and all physical duplicates';
   end if;
 else
   if length(btrim(coalesce(p_discrepancy_notes,'')))<10 then
     raise exception 'Curia discrepancy requires documented explanation';
   end if;
 end if;
 insert into public.fs_curia_reviews (
   remittance_id,curia_fund_receipt_id,curia_acknowledgment_reference,
   decision,counted_amount_centavos,verified_duplicate_count,
   reviewed_by,discrepancy_notes)
 values(p_remittance_id,p_curia_fund_receipt_id,
   case when p_decision='confirmed' then p_ack_reference else null end,
   p_decision,v_funds.amount_centavos,v_verified_copies,v_actor,p_discrepancy_notes)
 returning id into v_review;
 update public.fs_remittances
  set status=case when p_decision='confirmed' then 'curia_confirmed' else 'discrepancy' end
  where id=p_remittance_id;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
 values('curia_review',v_review,'curia_'||p_decision,v_actor,
   pg_catalog.jsonb_build_object('remittance_id',p_remittance_id,'copy_count',v_verified_copies));
 return v_review;
exception when no_data_found then
 raise exception 'Remittance or verified Curia fund receipt not found';
end; $$;

revoke all on function fs_internal.submit_cowl_remittance(uuid[],text,text,timestamptz,boolean) from public,anon;
revoke all on function fs_internal.record_curia_funds(uuid,text,bigint,text,text,timestamptz,text) from public,anon;
revoke all on function fs_internal.verify_curia_duplicate(uuid,uuid,boolean) from public,anon;
revoke all on function fs_internal.complete_curia_remittance(uuid,uuid,text,text,text) from public,anon;
grant execute on function fs_internal.submit_cowl_remittance(uuid[],text,text,timestamptz,boolean) to authenticated;
grant execute on function fs_internal.record_curia_funds(uuid,text,bigint,text,text,timestamptz,text) to authenticated;
grant execute on function fs_internal.verify_curia_duplicate(uuid,uuid,boolean) to authenticated;
grant execute on function fs_internal.complete_curia_remittance(uuid,uuid,text,text,text) to authenticated;

-- Exposed wrappers remain security INVOKER and route to checked private functions.
create function public.fs_submit_cowl_remittance(
 p_collection_ids uuid[],p_channel text,p_transfer_reference text,
 p_transferred_at timestamptz,p_duplicate_copies_checked boolean
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.submit_cowl_remittance(
  p_collection_ids,p_channel,p_transfer_reference,p_transferred_at,p_duplicate_copies_checked);
$$;
create function public.fs_record_curia_received_funds(
 p_remittance_id uuid,p_channel text,p_amount_centavos bigint,
 p_external_reference text,p_curia_destination_fingerprint text,
 p_received_at timestamptz,p_curia_statement_evidence_path text
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.record_curia_funds(
  p_remittance_id,p_channel,p_amount_centavos,
  p_external_reference,p_curia_destination_fingerprint,p_received_at,p_curia_statement_evidence_path);
$$;
create function public.fs_verify_curia_receipt_copy(
 p_remittance_id uuid,p_receipt_issue_id uuid,p_physical_copy_examined boolean
) returns void language sql security invoker set search_path=''
as $$
 select fs_internal.verify_curia_duplicate(p_remittance_id,p_receipt_issue_id,p_physical_copy_examined);
$$;
create function public.fs_complete_curia_review(
 p_remittance_id uuid,p_curia_fund_receipt_id uuid,
 p_decision text,p_ack_reference text,p_discrepancy_notes text
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.complete_curia_remittance(
  p_remittance_id,p_curia_fund_receipt_id,p_decision,p_ack_reference,p_discrepancy_notes);
$$;
revoke all on function public.fs_submit_cowl_remittance(uuid[],text,text,timestamptz,boolean) from public,anon;
revoke all on function public.fs_record_curia_received_funds(uuid,text,bigint,text,text,timestamptz,text) from public,anon;
revoke all on function public.fs_verify_curia_receipt_copy(uuid,uuid,boolean) from public,anon;
revoke all on function public.fs_complete_curia_review(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.fs_submit_cowl_remittance(uuid[],text,text,timestamptz,boolean) to authenticated;
grant execute on function public.fs_record_curia_received_funds(uuid,text,bigint,text,text,timestamptz,text) to authenticated;
grant execute on function public.fs_verify_curia_receipt_copy(uuid,uuid,boolean) to authenticated;
grant execute on function public.fs_complete_curia_review(uuid,uuid,text,text,text) to authenticated;
