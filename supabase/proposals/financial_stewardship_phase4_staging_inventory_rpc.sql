-- Staging only: complete authenticated Curia receipt inventory entrypoints.
-- No staff grants or actual booklet/series are silently created.
create function fs_internal.curia_register_series(p_issuing_entity text,p_series_code text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
 if v_actor is null or not fs_internal.has_staff_role('curia_receipt_custodian') then
   raise exception 'Curia receipt custodian authorization required' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_issuing_entity,''))) not between 5 and 150
    or length(btrim(coalesce(p_series_code,''))) not between 3 and 60 then
   raise exception 'Official issuing entity and series identification are required';
 end if;
 insert into public.fs_receipt_series(issuing_entity,series_code,approved_by)
 values(btrim(p_issuing_entity),btrim(p_series_code),v_actor)
 returning id into v_id;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id)
 values('receipt_series',v_id,'curia_series_registered',v_actor);
 return v_id;
end; $$;

create function fs_internal.curia_receipt_custodian_directory()
returns table(user_id uuid, display_label text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if (select auth.uid()) is null
   or not fs_internal.has_staff_role('curia_receipt_custodian') then
   raise exception 'Curia receipt custodian authorization required' using errcode='42501';
 end if;
 return query
 select distinct g.user_id,
   coalesce(nullif(btrim(u.email),''),g.user_id::text)::text
 from public.fs_staff_grants g
 join auth.users u on u.id=g.user_id
 where g.role_code='cowl_receipt_issuer'
   and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())
 order by 2;
end; $$;
revoke all on function fs_internal.curia_register_series(text,text) from public,anon;
revoke all on function fs_internal.curia_receipt_custodian_directory() from public,anon;
grant execute on function fs_internal.curia_register_series(text,text) to authenticated;
grant execute on function fs_internal.curia_receipt_custodian_directory() to authenticated;

create function public.fs_curia_register_receipt_series(p_issuing_entity text,p_series_code text)
returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.curia_register_series(p_issuing_entity,p_series_code);
$$;
create function public.fs_curia_list_cowl_custodians()
returns table(user_id uuid,display_label text)
language sql security invoker set search_path=''
as $$
 select * from fs_internal.curia_receipt_custodian_directory();
$$;
revoke all on function public.fs_curia_register_receipt_series(text,text) from public,anon;
revoke all on function public.fs_curia_list_cowl_custodians() from public,anon;
grant execute on function public.fs_curia_register_receipt_series(text,text) to authenticated;
grant execute on function public.fs_curia_list_cowl_custodians() to authenticated;
