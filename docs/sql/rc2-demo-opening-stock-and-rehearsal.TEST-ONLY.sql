-- TEST project only. Do not apply to production. Demo RPCs are not operational authority.

alter table public.fs_receipt_numbers drop constraint fs_receipt_numbers_status_check;
alter table public.fs_receipt_numbers add constraint fs_receipt_numbers_status_check check(status in ('available','issued','voided','missing','returned','previously_issued','previously_voided'));
create function fs_internal.rc2_register_opening_booklet(p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text,p_prior_issued integer,p_prior_voided integer,p_checked boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); b uuid; total integer;
begin
 if actor is null or not exists(select 1 from public.fs_staff_grants where user_id=actor and role_code='curia_receipt_custodian' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now())) then raise exception 'Curia custodian required' using errcode='42501'; end if;
 if not coalesce(p_checked,false) or p_booklet_reference is null or p_booklet_reference !~ '^DEMO-[A-Z0-9-]{1,45}$' or not exists(select 1 from public.fs_receipt_series where id=p_series_id and series_code like 'DEMO-%') then raise exception 'Checked fictional demo series and booklet required'; end if;
 if p_first_no is null or p_last_no is null or p_first_no !~ '^[0-9]{4,12}$' or p_last_no !~ '^[0-9]{4,12}$' or length(p_first_no)<>length(p_last_no) then raise exception 'Invalid serials'; end if;
 if p_last_no::numeric-p_first_no::numeric not between 0 and 499 then raise exception 'Invalid range'; end if;
 total:=(p_last_no::numeric-p_first_no::numeric+1)::integer;
 if p_prior_issued is null or p_prior_voided is null or p_prior_issued<0 or p_prior_voided<0 or p_prior_issued::bigint+p_prior_voided::bigint>total then raise exception 'Opening counts do not reconcile'; end if;
 b:=fs_internal.curia_register_booklet(p_series_id,p_booklet_reference,p_first_no,p_last_no);
 update public.fs_receipt_numbers set status=case when printed_no::numeric-p_first_no::numeric<p_prior_issued then 'previously_issued' else 'previously_voided' end where booklet_id=b and printed_no::numeric-p_first_no::numeric<p_prior_issued+p_prior_voided;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata) values('receipt_booklet',b,'demo_opening_stock_reconciled',actor,jsonb_build_object('previously_issued',p_prior_issued,'previously_voided',p_prior_voided,'available',total-p_prior_issued-p_prior_voided));
 return b;
end $$;
revoke all on function fs_internal.rc2_register_opening_booklet(uuid,text,text,text,integer,integer,boolean) from public,anon;
grant execute on function fs_internal.rc2_register_opening_booklet(uuid,text,text,text,integer,integer,boolean) to authenticated;
create function public.fs_demo_register_opening_booklet(p_series_id uuid,p_booklet_reference text,p_first_no text,p_last_no text,p_prior_issued integer,p_prior_voided integer,p_checked boolean) returns uuid language sql security invoker set search_path='' as $$ select fs_internal.rc2_register_opening_booklet(p_series_id,p_booklet_reference,p_first_no,p_last_no,p_prior_issued,p_prior_voided,p_checked); $$;
revoke all on function public.fs_demo_register_opening_booklet(uuid,text,text,text,integer,integer,boolean) from public,anon;
grant execute on function public.fs_demo_register_opening_booklet(uuid,text,text,text,integer,integer,boolean) to authenticated;
create function fs_internal.rc2_new_rehearsal() returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cowl uuid; m uuid; p uuid; f uuid; b uuid; s uuid; stock uuid; ref text:='DEMO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
begin
 if actor is null or not exists(select 1 from public.fs_staff_grants where user_id=actor and role_code='curia_receipt_custodian' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now())) then raise exception 'Curia custodian required' using errcode='42501'; end if;
 select user_id into cowl from public.fs_staff_grants where role_code='cowl_receipt_issuer' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) and user_id<>actor;
 if not found or (select count(*) from public.fs_staff_grants where role_code='cowl_receipt_issuer' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()))<>1 then raise exception 'Exactly one separate TEST issuer required'; end if;
 select id into m from public.fs_ministries where canonical_name='DEMO - Fictional Ministry';
 select id into f from public.fs_fee_schedules where ministry_id=m and service_year=2026 and version=1 and status='approved' and rate_centavos=5000;
 if f is null then raise exception 'Fictional fee fixture unavailable'; end if;
 insert into public.fs_parishes(canonical_name) values('DEMO - Fictional Parish '||ref) returning id into p;
 insert into public.fs_renewal_batches(renewal_reference,parish_id,ministry_id,service_year,kind,origin,submitted_by,status,reviewed_by,reviewed_at) values(ref||'-BATCH',p,m,2026,'original','staff',cowl,'approved',actor,now()) returning id into b;
 insert into public.fs_payment_requests(payment_reference,batch_id,quote_version,fee_schedule_id,quoted_participants,total_due_centavos,status,issued_by) values(ref||'-PAY',b,1,f,10,50000,'quoted',cowl);
 s:=public.fs_curia_register_receipt_series('DEMONSTRATION - NOT VALID',ref);
 stock:=fs_internal.rc2_register_opening_booklet(s,ref||'-BOOK','900001','900050',10,2,true);
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata) values('receipt_booklet',stock,'demo_rehearsal_created',actor,jsonb_build_object('reference',ref));
 return ref;
end $$;
revoke all on function fs_internal.rc2_new_rehearsal() from public,anon;
grant execute on function fs_internal.rc2_new_rehearsal() to authenticated;
create function public.fs_demo_new_rehearsal() returns text language sql security invoker set search_path='' as $$ select fs_internal.rc2_new_rehearsal(); $$;
revoke all on function public.fs_demo_new_rehearsal() from public,anon;
grant execute on function public.fs_demo_new_rehearsal() to authenticated;
