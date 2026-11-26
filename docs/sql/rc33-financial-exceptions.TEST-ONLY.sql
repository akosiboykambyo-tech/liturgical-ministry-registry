-- TEST ONLY: controlled financial exceptions and authorized reconsideration.
create function rc33_demo.reconsider(p_item uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare i rc33_demo.items%rowtype;b rc33_demo.batches%rowtype;c uuid;
begin
 perform rc32_demo.require_admin();
 select cycle_id into strict c from rc33_demo.items where id=p_item;
 perform 1 from rc33_demo.cycles where id=c for update;
 select * into strict i from rc33_demo.items where id=p_item for update;
 select * into strict b from rc33_demo.batches where id=i.batch_id for update;
 if i.decision<>'rejected' or i.reservation_released_at is not null or b.status not in ('reviewed','closed_no_charge') or length(trim(coalesce(p_reason,''))) not between 10 and 300 then raise exception 'Only independently rejected finalized proposals may be reconsidered with documented reason';end if;
 update rc33_demo.items set reservation_released_at=now() where id=i.id;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(c,b.id,auth.uid(),'reconsideration_authorized',jsonb_build_object('item',i.id,'reason',trim(p_reason)));
end $$;
create function rc33_demo.change_method(p_batch uuid,p_method text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare b rc33_demo.batches%rowtype;c uuid;
begin
 perform rc32_demo.require_admin();
 select cycle_id into strict c from rc33_demo.batches where id=p_batch;
 perform 1 from rc33_demo.cycles where id=c for update;
 select * into strict b from rc33_demo.batches where id=p_batch for update;
 if b.status<>'reviewed' or b.aggregate_id is not null or p_method is null or p_method not in ('OTC','QR') or length(trim(coalesce(p_reason,''))) not between 5 and 300 then raise exception 'Only ungrouped reviewed batches may change method with reason';end if;
 update rc33_demo.batches set preferred_method=p_method where id=b.id;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(c,b.id,auth.uid(),'preferred_method_changed',jsonb_build_object('old',b.preferred_method,'new',p_method,'reason',p_reason));
end $$;
create table rc33_demo.advances(
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null references rc33_demo.cycles(id),ministry text not null references rc32_demo.ministries(name),
 request_id uuid not null unique references public.fs_payment_requests(id),collection_id uuid unique references public.fs_collections(id),
 amount_centavos bigint not null check(amount_centavos>0),declared_count integer not null check(declared_count>0),
 collected_by uuid not null,collected_at timestamptz not null default now(),allocated_application uuid unique references rc3_demo.applications(id),
 allocated_by uuid,allocated_at timestamptz,discrepancy_note text,
 unique(cycle_id,ministry)
);
alter table rc33_demo.advances enable row level security;
revoke all on rc33_demo.advances from public,anon,authenticated;
create function rc33_demo.require_finance() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce((rc3_demo.roles()->>'finance')::boolean,false) then raise exception 'COWL finance verifier required' using errcode='42501';end if;
end $$;
-- Existing receipt and remittance procedures operate on the posted collection. The holding
-- batch is expressly DRAFT, not a reviewed renewal; no application_members or validation.
create function rc33_demo.record_advance(p_parish text,p_year integer,p_ministry text,p_count integer,p_amount bigint,p_cash_counted boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid;par uuid;min uuid;fee uuid;ledger uuid;parent uuid;req uuid;adv uuid;coll uuid;ref text;actor uuid:=auth.uid();
begin
 perform rc33_demo.require_finance();
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 or not exists(select 1 from rc32_demo.ministries where name=p_ministry) or p_count is null or p_count not between 1 and 150 or p_amount is distinct from p_count::bigint*5000 or not coalesce(p_cash_counted,false) then raise exception 'Exact provisional fictional advance amount and counted cash required';end if;
 insert into rc33_demo.cycles(parish,service_year) values(p_parish,p_year) on conflict(parish,service_year) do nothing;
 select id into strict c from rc33_demo.cycles where parish=p_parish and service_year=p_year for update;
 if exists(select 1 from rc33_demo.advances where cycle_id=c and ministry=p_ministry) or exists(select 1 from rc33_demo.batches where cycle_id=c and ministry=p_ministry) then raise exception 'An advance or application already exists; do not collect twice';end if;
 perform pg_advisory_xact_lock(hashtextextended('rc3-demo-fees-and-batches',0));
 insert into public.fs_parishes(canonical_name) values('RC3 DEMO - '||p_parish) on conflict(canonical_name) do nothing;
 select id into strict par from public.fs_parishes where canonical_name='RC3 DEMO - '||p_parish and active;
 insert into public.fs_ministries(canonical_name) values('RC3 DEMO - Advance holding - '||p_ministry) on conflict(canonical_name) do nothing;
 select id into strict min from public.fs_ministries where canonical_name='RC3 DEMO - Advance holding - '||p_ministry and active;
 insert into public.fs_fee_schedules(ministry_id,service_year,version,rate_centavos,status,approved_by,approved_at) values(min,p_year,1,5000,'approved',actor,now()) on conflict(ministry_id,service_year,version) do nothing;
 select id into strict fee from public.fs_fee_schedules where ministry_id=min and service_year=p_year and version=1 and rate_centavos=5000 and status='approved';
 ref:='RC3-DEMO-ADV33-'||upper(replace(gen_random_uuid()::text,'-',''));
 select id into parent from public.fs_renewal_batches where parish_id=par and ministry_id=min and service_year=p_year and kind='original';
 insert into public.fs_renewal_batches(renewal_reference,parish_id,ministry_id,service_year,kind,parent_batch_id,origin,submitted_by,status)
 values(ref,par,min,p_year,case when parent is null then 'original' else 'supplemental' end,parent,'staff',actor,'draft') returning id into ledger;
 insert into public.fs_payment_requests(payment_reference,batch_id,quote_version,fee_schedule_id,quoted_participants,total_due_centavos,status,issued_by)
 values(ref||'-PAY',ledger,1,fee,p_count,p_amount,'quoted',actor) returning id into req;
 insert into rc33_demo.advances(cycle_id,ministry,request_id,amount_centavos,declared_count,collected_by) values(c,p_ministry,req,p_amount,p_count,actor) returning id into adv;
 coll:=public.fs_record_otc_payment(req,p_amount,now(),true);
 update rc33_demo.advances set collection_id=coll where id=adv;
 insert into rc33_demo.events(cycle_id,actor,action,details) values(c,actor,'unallocated_advance_collected',jsonb_build_object('advance',adv,'collection',coll,'amount_centavos',p_amount));
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata) values('collection',coll,'rc33_unallocated_advance_collected',actor,jsonb_build_object('advance',adv,'ministry',p_ministry));
 return adv;
end $$;
-- Prevent a normal new quote from bypassing an existing advance. Existing legacy/RC3.2 applications untouched.
create function rc33_demo.guard_advance_authorization() returns trigger language plpgsql security definer set search_path='' as $$
declare v rc33_demo.advances%rowtype;
begin
 if new.reference not like 'RN-DEMO-RC33-%' or new.status<>'awaiting_payment' or old.status='awaiting_payment' then return new;end if;
 for v in select ad.* from rc33_demo.advances ad join rc33_demo.batches b on b.cycle_id=ad.cycle_id and b.ministry=ad.ministry where b.aggregate_id=new.id and b.kind='original' and ad.allocated_application is null loop
  if not exists(select 1 from rc3_demo.financial_links l where l.application_id=new.id and l.payment_request_id=v.request_id) then raise exception 'Unallocated OTC advance exists; exact allocation or discrepancy resolution required' using errcode='23514';end if;
 end loop;
 return new;
end $$;
create trigger rc33_advance_authorization before update of status on rc3_demo.applications for each row execute function rc33_demo.guard_advance_authorization();
create function rc33_demo.allocate_advance(p_advance uuid,p_application uuid) returns text language plpgsql security definer set search_path='' as $$
declare ad rc33_demo.advances%rowtype;b rc33_demo.batches%rowtype;a rc3_demo.applications%rowtype;req public.fs_payment_requests%rowtype;expected bigint;receipt_id uuid;actor uuid:=auth.uid();
begin
 perform rc33_demo.require_finance();
 select * into strict ad from rc33_demo.advances where id=p_advance;
 perform 1 from rc33_demo.cycles where id=ad.cycle_id for update;
 select * into strict ad from rc33_demo.advances where id=p_advance for update;
 if ad.allocated_application=p_application then return 'allocated';end if;
 if ad.allocated_application is not null then raise exception 'Advance already allocated';end if;
 select * into strict a from rc3_demo.applications where id=p_application for update;
 select * into strict b from rc33_demo.batches where aggregate_id=a.id and cycle_id=ad.cycle_id and ministry=ad.ministry and kind='original';
 if a.status<>'documents_approved' or a.reviewed_by is null or a.preferred_payment_method<>'OTC' or (select count(*) from rc33_demo.batches where aggregate_id=a.id)<>1 or exists(select 1 from rc3_demo.financial_links where application_id=a.id) then raise exception 'Advance requires one independently reviewed OTC original obligation';end if;
 select count(*)*5000 into expected from rc3_demo.application_members where application_id=a.id;
 select * into strict req from public.fs_payment_requests where id=ad.request_id for update;
 if req.status<>'paid' or not exists(select 1 from public.fs_collections where id=ad.collection_id and payment_request_id=req.id and status='posted' and amount_centavos=ad.amount_centavos) then raise exception 'Advance collection is not verified';end if;
 select id into receipt_id from public.fs_receipt_issues where collection_id=ad.collection_id and amount_centavos=ad.amount_centavos;
 if expected<>ad.amount_centavos then
  update rc33_demo.advances set discrepancy_note='Approved assessment '||expected::text||' centavos differs from verified advance '||ad.amount_centavos::text||' centavos. Authorized adjustment required.' where id=ad.id;
  insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(ad.cycle_id,b.id,actor,'advance_discrepancy_flagged',jsonb_build_object('expected_centavos',expected,'advance_centavos',ad.amount_centavos));
  return 'discrepancy';
 end if;
 if receipt_id is null then return 'receipt_required';end if;
 insert into rc3_demo.financial_links(application_id,payment_request_id) values(a.id,req.id);
 update rc3_demo.applications set status='awaiting_payment',due_centavos=expected,authorized_by=actor,authorized_at=now() where id=a.id;
 update rc33_demo.advances set allocated_application=a.id,allocated_by=actor,allocated_at=now(),discrepancy_note=null where id=ad.id;
 perform rc3_demo.sync_settlement(req.id);
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(ad.cycle_id,b.id,actor,'advance_allocated',jsonb_build_object('application',a.id,'collection',ad.collection_id,'receipt',receipt_id));
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata) values('payment_request',req.id,'rc33_advance_allocated',actor,jsonb_build_object('application',a.id,'advance',ad.id));
 return 'allocated';
end $$;
create function rc33_demo.advance_list(p_parish text,p_year integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare roles jsonb:=rc3_demo.roles();
begin
 if auth.uid() is null or not(coalesce((roles->>'admin')::boolean,false) or coalesce((roles->>'finance')::boolean,false)) then raise exception 'Authorized TEST staff required' using errcode='42501';end if;
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 then raise exception 'Unknown fictional cycle';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',ad.id,'ministry',ad.ministry,'amount_centavos',ad.amount_centavos,'declared_count',ad.declared_count,'allocated_application',ad.allocated_application,'discrepancy_note',ad.discrepancy_note,'payment_reference',p.payment_reference,'receipt_recorded',exists(select 1 from public.fs_receipt_issues ri where ri.collection_id=ad.collection_id),'collection_id',ad.collection_id) order by ad.collected_at desc) from rc33_demo.advances ad join rc33_demo.cycles c on c.id=ad.cycle_id join public.fs_payment_requests p on p.id=ad.request_id where c.parish=p_parish and c.service_year=p_year),'[]');
end $$;
create function rc33_demo.group_detail(p_application uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:=rc3_demo.roles();
begin
 if auth.uid() is null or not(coalesce((r->>'admin')::boolean,false) or coalesce((r->>'finance')::boolean,false)) then raise exception 'Authorized TEST staff required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('ministry',b.ministry,'kind',b.kind,'reference',b.reference,'channel',b.channel,'approved_count',(select count(*) from rc33_demo.items where batch_id=b.id and decision='approved'),'advance_id',(select ad.id from rc33_demo.advances ad where ad.cycle_id=b.cycle_id and ad.ministry=b.ministry and ad.allocated_application is null and b.kind='original'))) from rc33_demo.batches b where b.aggregate_id=p_application),'[]');
end $$;
create function public.rc33_demo_reconsider(p_item uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select rc33_demo.reconsider(p_item,p_reason)$$;
revoke all on function rc33_demo.reconsider(uuid,text),public.rc33_demo_reconsider(uuid,text) from public,anon,authenticated;
grant execute on function rc33_demo.reconsider(uuid,text),public.rc33_demo_reconsider(uuid,text) to authenticated;
create function public.rc33_demo_change_method(p_batch uuid,p_method text,p_reason text) returns void language sql security invoker set search_path='' as $$select rc33_demo.change_method(p_batch,p_method,p_reason)$$;
revoke all on function rc33_demo.change_method(uuid,text,text),public.rc33_demo_change_method(uuid,text,text) from public,anon,authenticated;
grant execute on function rc33_demo.change_method(uuid,text,text),public.rc33_demo_change_method(uuid,text,text) to authenticated;
create function public.rc33_demo_record_advance(p_parish text,p_year integer,p_ministry text,p_count integer,p_amount bigint,p_cash_counted boolean) returns uuid language sql security invoker set search_path='' as $$select rc33_demo.record_advance(p_parish,p_year,p_ministry,p_count,p_amount,p_cash_counted)$$;
revoke all on function rc33_demo.record_advance(text,integer,text,integer,bigint,boolean),public.rc33_demo_record_advance(text,integer,text,integer,bigint,boolean) from public,anon,authenticated;
grant execute on function rc33_demo.record_advance(text,integer,text,integer,bigint,boolean),public.rc33_demo_record_advance(text,integer,text,integer,bigint,boolean) to authenticated;
create function public.rc33_demo_allocate_advance(p_advance uuid,p_application uuid) returns text language sql security invoker set search_path='' as $$select rc33_demo.allocate_advance(p_advance,p_application)$$;
revoke all on function rc33_demo.allocate_advance(uuid,uuid),public.rc33_demo_allocate_advance(uuid,uuid) from public,anon,authenticated;
grant execute on function rc33_demo.allocate_advance(uuid,uuid),public.rc33_demo_allocate_advance(uuid,uuid) to authenticated;
create function public.rc33_demo_advance_list(p_parish text,p_year integer) returns jsonb language sql security invoker set search_path='' as $$select rc33_demo.advance_list(p_parish,p_year)$$;
revoke all on function rc33_demo.advance_list(text,integer),public.rc33_demo_advance_list(text,integer) from public,anon,authenticated;
grant execute on function rc33_demo.advance_list(text,integer),public.rc33_demo_advance_list(text,integer) to authenticated;
create function public.rc33_demo_group_detail(p_application uuid) returns jsonb language sql security invoker set search_path='' as $$select rc33_demo.group_detail(p_application)$$;
revoke all on function rc33_demo.group_detail(uuid),public.rc33_demo_group_detail(uuid) from public,anon,authenticated;
grant execute on function rc33_demo.group_detail(uuid),public.rc33_demo_group_detail(uuid) to authenticated;
revoke all on function rc33_demo.require_finance(),rc33_demo.guard_advance_authorization() from public,anon,authenticated;
create function rc33_demo.guard_advance_group() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.aggregate_id is not null and new.kind='original' and exists(select 1 from rc33_demo.advances where cycle_id=new.cycle_id and ministry=new.ministry and allocated_application is null) then
  if new.preferred_method<>'OTC' or (select count(*) from rc3_demo.application_members where application_id=new.aggregate_id)<>(select count(*) from rc33_demo.items where batch_id=new.id and decision='approved') then raise exception 'Advance-funded ministry requires its own OTC obligation';end if;
 end if;
 return new;
end $$;
create trigger rc33_advance_group before update of aggregate_id on rc33_demo.batches for each row execute function rc33_demo.guard_advance_group();
revoke all on function rc33_demo.guard_advance_group() from public,anon,authenticated;
