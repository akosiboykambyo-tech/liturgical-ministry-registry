-- Staging custody hardening: backend requires physical verification for
-- registering printed stock, and Curia handover officer cannot self-acknowledge.
create function fs_internal.curia_register_checked_booklet(
 p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text,
 p_physical_range_checked boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
begin
 if not coalesce(p_physical_range_checked,false) then
   raise exception 'Curia must physically inspect the preprinted booklet range';
 end if;
 return fs_internal.curia_register_booklet(
   p_series_id,p_booklet_reference,p_first_no,p_last_no);
end; $$;
revoke all on function fs_internal.curia_register_booklet(uuid,text,text,text)
 from public,anon,authenticated;
revoke all on function public.fs_curia_register_receipt_booklet(uuid,text,text,text)
 from public,anon,authenticated;
revoke all on function fs_internal.curia_register_checked_booklet(uuid,text,text,text,boolean)
 from public,anon;
grant execute on function fs_internal.curia_register_checked_booklet(uuid,text,text,text,boolean)
 to authenticated;
create function public.fs_curia_register_checked_booklet(
 p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text,
 p_physical_range_checked boolean
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.curia_register_checked_booklet(
   p_series_id,p_booklet_reference,p_first_no,p_last_no,p_physical_range_checked);
$$;
revoke all on function public.fs_curia_register_checked_booklet(uuid,text,text,text,boolean)
 from public,anon;
grant execute on function public.fs_curia_register_checked_booklet(uuid,text,text,text,boolean)
 to authenticated;

create function fs_internal.enforce_two_party_receipt_custody()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare v_assigning_officer uuid;
begin
 if old.custody_state='curia_stock'
    and new.custody_state='awaiting_cowl_ack'
    and new.assigned_to=(select auth.uid()) then
   raise exception 'Curia handover officer cannot assign a booklet to themselves';
 end if;
 if old.custody_state='awaiting_cowl_ack'
    and new.custody_state='cowl_custody' then
   select actor_id into v_assigning_officer
   from public.fs_receipt_custody_events
   where booklet_id=old.id and event_kind='assigned'
   order by event_at desc,id desc limit 1;
   if v_assigning_officer is null or
      new.acknowledged_by=v_assigning_officer then
     raise exception 'COWL receiving custodian must differ from Curia assigning officer';
   end if;
 end if;
 return new;
end; $$;
revoke all on function fs_internal.enforce_two_party_receipt_custody()
 from public,anon,authenticated;
create trigger fs_enforce_two_party_booklet
before update on public.fs_receipt_booklets
for each row execute function fs_internal.enforce_two_party_receipt_custody();
