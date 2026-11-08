-- Phase 4: test-only Curia-issued booklet inventory, custody and immutability.
-- No actual receipt numbers are seeded. Only authorized trusted operations
-- may introduce an actual Curia-approved printed series/range into stock.
create function fs_internal.curia_register_booklet(
 p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_first numeric;
 v_last numeric;
 v_width integer;
 v_i integer;
 v_booklet uuid;
begin
 if v_actor is null or not fs_internal.has_staff_role('curia_receipt_custodian') then
   raise exception 'Curia receipt custodian authorization required' using errcode='42501';
 end if;
 if p_first_no !~ '^[0-9]{4,12}$' or p_last_no !~ '^[0-9]{4,12}$'
     or length(p_first_no)<>length(p_last_no) then
    raise exception 'Use the exact matching-width preprinted numeric receipt numbers';
 end if;
 if length(btrim(coalesce(p_booklet_reference,'')))<3 then
   raise exception 'Curia-assigned booklet reference is required';
 end if;
 v_first:=p_first_no::numeric;
 v_last:=p_last_no::numeric;
 v_width:=length(p_first_no);
 if v_last-v_first not between 0 and 499 then
    raise exception 'Booklet range must be positive and contain at most 500 printed numbers';
 end if;
 -- Serializes range check and inventory creation for this actual Curia series.
 perform 1 from public.fs_receipt_series where id=p_series_id for update;
 if not found then raise exception 'Curia series not registered'; end if;
 if exists(select 1 from public.fs_receipt_booklets b
   where b.series_id=p_series_id and b.first_printed_no::numeric<=v_last
     and b.last_printed_no::numeric>=v_first) then
   raise exception 'Printed official receipt booklet range overlaps existing registered stock';
 end if;
 insert into public.fs_receipt_booklets(
   booklet_reference,series_id,first_printed_no,last_printed_no,registered_by)
 values(p_booklet_reference,p_series_id,p_first_no,p_last_no,v_actor)
 returning id into v_booklet;
 for v_i in 0..(v_last-v_first)::integer loop
   insert into public.fs_receipt_numbers(booklet_id,series_id,printed_no)
   values(v_booklet,p_series_id,lpad((v_first+v_i)::text,v_width,'0'));
 end loop;
 insert into public.fs_receipt_custody_events(
   booklet_id,event_kind,actor_id,notes)
 values(v_booklet,'registered',v_actor,'Curia recorded actual physical printed stock');
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
 values('receipt_booklet',v_booklet,'curia_stock_registered',v_actor,
  pg_catalog.jsonb_build_object('range_size',(v_last-v_first+1)::int));
 return v_booklet;
end; $$;

create function fs_internal.curia_assign_booklet(
 p_booklet_id uuid,p_cowl_custodian_id uuid,p_handover_confirmed boolean
) returns void language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_booklet public.fs_receipt_booklets%rowtype;
begin
 if v_actor is null or not fs_internal.has_staff_role('curia_receipt_custodian') then
   raise exception 'Curia receipt custodian authorization required' using errcode='42501';
 end if;
 if not coalesce(p_handover_confirmed,false) then
   raise exception 'Physical receipt booklet handover requires explicit confirmation';
 end if;
 if not exists(select 1 from public.fs_staff_grants g
   where g.user_id=p_cowl_custodian_id and g.role_code='cowl_receipt_issuer'
     and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())) then
   raise exception 'COWL receiving officer lacks authorized receipt custody role';
 end if;
 select * into strict v_booklet from public.fs_receipt_booklets
 where id=p_booklet_id for update;
 if v_booklet.custody_state<>'curia_stock' then
   raise exception 'Only Curia-held booklets can be assigned';
 end if;
 update public.fs_receipt_booklets set
   custody_state='awaiting_cowl_ack', assigned_to=p_cowl_custodian_id
 where id=p_booklet_id;
 insert into public.fs_receipt_custody_events(
   booklet_id,event_kind,actor_id,recipient_id,notes)
 values(p_booklet_id,'assigned',v_actor,p_cowl_custodian_id,
   'Physical handover declared by Curia; COWL acknowledgment pending');
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id)
 values('receipt_booklet',p_booklet_id,'curia_assigned_to_cowl',v_actor);
exception when no_data_found then
 raise exception 'Curia receipt booklet not found';
end; $$;

create function fs_internal.cowl_acknowledge_booklet(
 p_booklet_id uuid,p_physically_checked boolean
) returns void language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_booklet public.fs_receipt_booklets%rowtype;
begin
 if v_actor is null or not fs_internal.has_staff_role('cowl_receipt_issuer') then
   raise exception 'Authorized COWL receipt custodian required' using errcode='42501';
 end if;
 if not coalesce(p_physically_checked,false) then
   raise exception 'COWL must physically verify the entire booklet and printed range';
 end if;
 select * into strict v_booklet from public.fs_receipt_booklets
 where id=p_booklet_id for update;
 if v_booklet.custody_state<>'awaiting_cowl_ack' or v_booklet.assigned_to<>v_actor then
   raise exception 'Booklet is not awaiting acknowledgment by this COWL custodian';
 end if;
 if (select count(*) from public.fs_receipt_numbers
     where booklet_id=p_booklet_id)
    <>(v_booklet.last_printed_no::numeric-v_booklet.first_printed_no::numeric+1) then
   raise exception 'Registered receipt stock does not match booklet range';
 end if;
 update public.fs_receipt_booklets set custody_state='cowl_custody',
    acknowledged_by=v_actor,acknowledged_at=now() where id=p_booklet_id;
 insert into public.fs_receipt_custody_events(
   booklet_id,event_kind,actor_id,notes)
 values(p_booklet_id,'acknowledged',v_actor,'Physical booklet and printed number range checked');
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id)
 values('receipt_booklet',p_booklet_id,'cowl_custody_acknowledged',v_actor);
exception when no_data_found then
 raise exception 'Booklet not found';
end; $$;

create function fs_internal.report_unusable_receipt(
 p_receipt_number_id uuid,p_status text,p_reason text,p_physically_verified boolean
) returns void language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_number public.fs_receipt_numbers%rowtype;
 v_booklet public.fs_receipt_booklets%rowtype;
begin
 if v_actor is null or not fs_internal.has_staff_role('cowl_receipt_issuer') then
   raise exception 'Authorized COWL receipt issuer required' using errcode='42501';
 end if;
 if p_status not in ('voided','missing') or
    length(btrim(coalesce(p_reason,'')))<10 or not coalesce(p_physically_verified,false) then
   raise exception 'Voided/missing receipt reports need physical check and reason';
 end if;
 select * into strict v_number from public.fs_receipt_numbers
 where id=p_receipt_number_id for update;
 select * into strict v_booklet from public.fs_receipt_booklets
 where id=v_number.booklet_id for update;
 if v_number.status<>'available' or v_booklet.custody_state<>'cowl_custody' then
    raise exception 'Only unused receipts in acknowledged COWL custody can be reported';
 end if;
 update public.fs_receipt_numbers set status=p_status where id=p_receipt_number_id;
 insert into public.fs_receipt_custody_events(booklet_id,event_kind,actor_id,notes)
 values(v_number.booklet_id,'exception_reported',v_actor,p_status||': '||p_reason);
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id)
 values('receipt_number',v_number.id,'cowl_receipt_'||p_status,v_actor);
exception when no_data_found then
 raise exception 'Receipt number or booklet not found';
end; $$;

-- Immutable accounting evidence: never rewrite verified bank credits,
-- issued paper receipts, confirmed Curia evidence, or append-only audit history.
create function fs_internal.reject_posted_evidence_mutation()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 raise exception 'Posted financial evidence is immutable. Use a reviewed reversal process.';
end; $$;
revoke all on function fs_internal.reject_posted_evidence_mutation() from public,anon,authenticated;
create trigger fs_guard_audit_history before update or delete on public.fs_audit_events
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_bank_credit_history before update or delete on public.fs_bank_credits
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_qr_reconciliation_history before update or delete on public.fs_payment_reconciliations
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_receipt_issue_history before update or delete on public.fs_receipt_issues
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_receipt_line_history before update or delete on public.fs_receipt_issue_lines
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_curia_funds_history before update or delete on public.fs_curia_fund_receipts
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_curia_reviews_history before update or delete on public.fs_curia_reviews
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_custody_history before update or delete on public.fs_receipt_custody_events
 for each row execute function fs_internal.reject_posted_evidence_mutation();
create trigger fs_guard_remittance_line_history before update or delete on public.fs_remittance_items
 for each row execute function fs_internal.reject_posted_evidence_mutation();

revoke all on function fs_internal.curia_register_booklet(uuid,text,text,text) from public,anon;
revoke all on function fs_internal.curia_assign_booklet(uuid,uuid,boolean) from public,anon;
revoke all on function fs_internal.cowl_acknowledge_booklet(uuid,boolean) from public,anon;
revoke all on function fs_internal.report_unusable_receipt(uuid,text,text,boolean) from public,anon;
grant execute on function fs_internal.curia_register_booklet(uuid,text,text,text) to authenticated;
grant execute on function fs_internal.curia_assign_booklet(uuid,uuid,boolean) to authenticated;
grant execute on function fs_internal.cowl_acknowledge_booklet(uuid,boolean) to authenticated;
grant execute on function fs_internal.report_unusable_receipt(uuid,text,text,boolean) to authenticated;

create function public.fs_curia_register_receipt_booklet(
 p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.curia_register_booklet(
  p_series_id,p_booklet_reference,p_first_no,p_last_no);
$$;
create function public.fs_curia_assign_receipt_booklet(
 p_booklet_id uuid,p_cowl_custodian_id uuid,p_handover_confirmed boolean
) returns void language sql security invoker set search_path=''
as $$
 select fs_internal.curia_assign_booklet(p_booklet_id,p_cowl_custodian_id,p_handover_confirmed);
$$;
create function public.fs_cowl_acknowledge_receipt_booklet(
 p_booklet_id uuid,p_physically_checked boolean
) returns void language sql security invoker set search_path=''
as $$
 select fs_internal.cowl_acknowledge_booklet(p_booklet_id,p_physically_checked);
$$;
create function public.fs_cowl_report_receipt_exception(
 p_receipt_number_id uuid,p_status text,p_reason text,p_physically_verified boolean
) returns void language sql security invoker set search_path=''
as $$
 select fs_internal.report_unusable_receipt(
  p_receipt_number_id,p_status,p_reason,p_physically_verified);
$$;
revoke all on function public.fs_curia_register_receipt_booklet(uuid,text,text,text) from public,anon;
revoke all on function public.fs_curia_assign_receipt_booklet(uuid,uuid,boolean) from public,anon;
revoke all on function public.fs_cowl_acknowledge_receipt_booklet(uuid,boolean) from public,anon;
revoke all on function public.fs_cowl_report_receipt_exception(uuid,text,text,boolean) from public,anon;
grant execute on function public.fs_curia_register_receipt_booklet(uuid,text,text,text) to authenticated;
grant execute on function public.fs_curia_assign_receipt_booklet(uuid,uuid,boolean) to authenticated;
grant execute on function public.fs_cowl_acknowledge_receipt_booklet(uuid,boolean) to authenticated;
grant execute on function public.fs_cowl_report_receipt_exception(uuid,text,text,boolean) to authenticated;
