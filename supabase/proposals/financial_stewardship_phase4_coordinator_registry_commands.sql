-- Phase 4 TEST ONLY. Minimal parish-scoped integration to the EXISTING registry.
-- Existing members and member_ministries are read-only; no renewal/inactivation
-- is applied to the production registration tables by these functions.

create function fs_internal.parish_ministry_roster(
 p_parish_id uuid,p_ministry_id uuid
) returns table (
 member_ministry_id uuid,member_uid text,member_display_name text,ministry_status text
) language plpgsql stable security definer set search_path=''
as $$
declare
 v_parish text;
 v_ministry text;
begin
 if (select auth.uid()) is null or
    not (fs_internal.is_parish_contact(p_parish_id)
      or fs_internal.has_staff_role('cowl_registry_reviewer')) then
    raise exception 'Not authorized to inspect this parish roster' using errcode='42501';
 end if;
 select canonical_name into strict v_parish from public.fs_parishes
 where id=p_parish_id and active;
 select canonical_name into strict v_ministry from public.fs_ministries
 where id=p_ministry_id and active;
 return query
   select mm.id,m.uid::text,
     btrim(m.first_name::text||' '||m.last_name::text),
     mm.status::text
   from public.member_ministries mm
   join public.members m on m.id=mm.member_id
   where m.parish=v_parish and mm.ministry=v_ministry
   order by m.last_name,m.first_name,mm.id;
exception when no_data_found then
 raise exception 'Parish or ministry not found or not active';
end; $$;

create function fs_internal.create_coordinator_renewal_draft(
 p_parish_id uuid,p_ministry_id uuid,p_year integer
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_batch uuid;
begin
 if v_actor is null or not fs_internal.is_parish_contact(p_parish_id) then
    raise exception 'Approved parish coordinator required' using errcode='42501';
 end if;
 if p_year not between 2000 and 2100 or
   not exists(select 1 from public.fs_parishes where id=p_parish_id and active) or
   not exists(select 1 from public.fs_ministries where id=p_ministry_id and active) then
   raise exception 'Invalid parish, ministry or renewal year';
 end if;
 insert into public.fs_renewal_batches(
 renewal_reference,parish_id,ministry_id,service_year,kind,origin,submitted_by,status)
 values('REN-'||p_year::text||'-'||substr(pg_catalog.replace(gen_random_uuid()::text,'-',''),1,12),
   p_parish_id,p_ministry_id,p_year,'original','parish_self_service',v_actor,'draft')
 returning id into v_batch;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id)
 values('renewal_batch',v_batch,'parish_coordinator_draft_created',v_actor);
 return v_batch;
end; $$;

create function fs_internal.submit_inactive_change_request(
 p_batch_id uuid,p_member_ministry_id uuid,p_reason text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_batch public.fs_renewal_batches%rowtype;
 v_request uuid;
begin
 if v_actor is null then
   raise exception 'Approved coordinator required' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then
   raise exception 'A reason between 10 and 2000 characters is required';
 end if;
 select * into strict v_batch from public.fs_renewal_batches
 where id=p_batch_id for update;
 if not fs_internal.is_parish_contact(v_batch.parish_id) then
   raise exception 'Coordinator is not appointed to this parish' using errcode='42501';
 end if;
 if v_batch.status not in ('draft','submitted','under_review','changes_requested') then
   raise exception 'Roster change request is not allowed in this renewal state';
 end if;
 if not exists (
   select 1 from public.member_ministries mm
   join public.members m on m.id=mm.member_id
   join public.fs_parishes p on p.id=v_batch.parish_id
   join public.fs_ministries ministry on ministry.id=v_batch.ministry_id
   where mm.id=p_member_ministry_id and m.parish=p.canonical_name
     and mm.ministry=ministry.canonical_name
 ) then
   raise exception 'Member-ministry assignment does not belong to this parish and ministry';
 end if;
 if exists (
   select 1 from public.fs_roster_change_requests r
   where r.batch_id=p_batch_id and r.member_ministry_id=p_member_ministry_id
    and r.request_kind='request_inactive' and r.status='pending'
 ) then
    raise exception 'An inactivation request for this member is already pending';
 end if;
 insert into public.fs_roster_change_requests(
 batch_id,member_ministry_id,request_kind,reason,requested_by)
 values(p_batch_id,p_member_ministry_id,'request_inactive',p_reason,v_actor)
 returning id into v_request;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id)
 values('roster_change',v_request,'inactive_requested_not_applied',v_actor);
 return v_request;
exception when no_data_found then
 raise exception 'Renewal batch not found';
end; $$;

revoke all on function fs_internal.parish_ministry_roster(uuid,uuid) from public,anon;
revoke all on function fs_internal.create_coordinator_renewal_draft(uuid,uuid,integer) from public,anon;
revoke all on function fs_internal.submit_inactive_change_request(uuid,uuid,text) from public,anon;
grant execute on function fs_internal.parish_ministry_roster(uuid,uuid) to authenticated;
grant execute on function fs_internal.create_coordinator_renewal_draft(uuid,uuid,integer) to authenticated;
grant execute on function fs_internal.submit_inactive_change_request(uuid,uuid,text) to authenticated;

create function public.fs_get_coordinator_roster(p_parish_id uuid,p_ministry_id uuid)
returns table (
 member_ministry_id uuid,member_uid text,member_display_name text,ministry_status text
) language sql security invoker set search_path=''
as $$
 select * from fs_internal.parish_ministry_roster(p_parish_id,p_ministry_id);
$$;
create function public.fs_create_renewal_draft(
 p_parish_id uuid,p_ministry_id uuid,p_year integer
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.create_coordinator_renewal_draft(p_parish_id,p_ministry_id,p_year);
$$;
create function public.fs_request_member_inactivation(
 p_batch_id uuid,p_member_ministry_id uuid,p_reason text
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.submit_inactive_change_request(
   p_batch_id,p_member_ministry_id,p_reason);
$$;
revoke all on function public.fs_get_coordinator_roster(uuid,uuid) from public,anon;
revoke all on function public.fs_create_renewal_draft(uuid,uuid,integer) from public,anon;
revoke all on function public.fs_request_member_inactivation(uuid,uuid,text) from public,anon;
grant execute on function public.fs_get_coordinator_roster(uuid,uuid) to authenticated;
grant execute on function public.fs_create_renewal_draft(uuid,uuid,integer) to authenticated;
grant execute on function public.fs_request_member_inactivation(uuid,uuid,text) to authenticated;
