-- RC3.3 candidate, TEST ONLY. Run in a rollback transaction until UI and security acceptance.
-- Separate fictional fixtures, no RC3.2 or production data changes.
set local lock_timeout='3s';
create schema rc33_demo;
revoke all on schema rc33_demo from public,anon,authenticated;
create table rc33_demo.cycles(
 id uuid primary key default gen_random_uuid(),parish text not null check(parish in ('RC33 Sample Parish A','RC33 Sample Parish B')),
 service_year integer not null check(service_year between 2026 and 2031),unique(parish,service_year)
);
create table rc33_demo.roster(
 assignment_id uuid primary key references rc3_demo.assignments(id),
 first_name text not null,last_name text not null
);
with seeded as (
 insert into rc3_demo.assignments(minister_label,parish,ministry)
 select 'Sample '||n.first_name||' '||n.last_name,p.parish,m.name
 from (values('RC33 Sample Parish A'),('RC33 Sample Parish B')) p(parish)
 cross join rc32_demo.ministries m cross join (values('Maria','Santos'),('Jose','Reyes'),('Teresa','Cruz'),('Rafael','Garcia')) n(first_name,last_name)
 returning id,minister_label
)
insert into rc33_demo.roster select id,split_part(minister_label,' ',2),split_part(minister_label,' ',3) from seeded;
create table rc33_demo.batches(
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null references rc33_demo.cycles(id),
 reference text unique not null default ('RN33-BATCH-'||upper(replace(gen_random_uuid()::text,'-',''))),
 ministry text not null references rc32_demo.ministries(name),kind text not null check(kind in ('original','supplemental')),
 parent_id uuid references rc33_demo.batches(id),channel text not null check(channel in ('walk_in','online_rehearsal')),
 preferred_method text not null check(preferred_method in ('OTC','QR')),
 status text not null default 'submitted' check(status in ('submitted','returned','reviewed','closed_no_charge')),
 revision integer not null default 1,return_note text,
 letter_name text,letter_reviewed_by uuid,letter_reviewed_at timestamptz,zero_declaration boolean not null,
 submitted_by uuid not null,submitted_at timestamptz not null default now(),
 reviewed_by uuid,reviewed_at timestamptz,aggregate_id uuid references rc3_demo.applications(id),
 check((kind='original' and parent_id is null) or (kind='supplemental' and parent_id is not null)),
 check((zero_declaration and letter_name is null) or (not zero_declaration and letter_name is not null))
);
create unique index rc33_one_original on rc33_demo.batches(cycle_id,ministry) where kind='original';
create table rc33_demo.items(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references rc33_demo.batches(id),
 cycle_id uuid not null references rc33_demo.cycles(id),ministry text not null references rc32_demo.ministries(name),
 assignment_id uuid references rc3_demo.assignments(id),first_name text not null,last_name text not null,name_key text not null,
 proposal text not null check(proposal in ('renew','hold','no','new_member','ministry_assignment','identity_review')),
 decision text not null check(decision in ('pending','approved','rejected','excluded')),reviewed_by uuid,reviewed_at timestamptz,note text,
 unique(batch_id,assignment_id)
);
-- A non-excluded assignment or name is reserved at submission, not merely at payment.
-- Rejected proposals remain reserved until a future authorized reconsideration workflow.
create unique index rc33_claim_assignment on rc33_demo.items(cycle_id,assignment_id) where assignment_id is not null and proposal<>'no';
create unique index rc33_claim_name on rc33_demo.items(cycle_id,ministry,name_key) where proposal<>'no';
create table rc33_demo.events(
 id bigint generated always as identity primary key,cycle_id uuid not null references rc33_demo.cycles(id),
 batch_id uuid references rc33_demo.batches(id),actor uuid not null,action text not null,details jsonb not null default '{}',at timestamptz not null default now()
);
alter table rc33_demo.cycles enable row level security;
alter table rc33_demo.roster enable row level security;
alter table rc33_demo.batches enable row level security;
alter table rc33_demo.items enable row level security;
alter table rc33_demo.events enable row level security;
revoke all on all tables in schema rc33_demo from public,anon,authenticated;
create function rc33_demo.name_key(p_first text,p_last text) returns text language sql immutable set search_path='' as $$
select lower(regexp_replace(trim(p_first),'[[:space:]]+',' ','g'))||chr(31)||lower(regexp_replace(trim(p_last),'[[:space:]]+',' ','g'))
$$;
create function rc33_demo.guard_legacy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.parish like 'RC33 Sample Parish %' and (new.reference not like 'RN-DEMO-RC33-%' or new.status<>'documents_approved') then
  raise exception 'RC3.3 fixtures require explicit assignment-reviewed intake' using errcode='23514';
 end if;
 return new;
end $$;
create trigger rc33_guard_legacy before insert on rc3_demo.applications for each row execute function rc33_demo.guard_legacy();
create function rc33_demo.open_cycle(p_parish text,p_year integer) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform rc32_demo.require_admin();
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 then raise exception 'Unknown fictional parish or year';end if;
 insert into rc33_demo.cycles(parish,service_year) values(p_parish,p_year) on conflict(parish,service_year) do nothing;
 select id into strict v_id from rc33_demo.cycles where parish=p_parish and service_year=p_year;return v_id;
end $$;
create function rc33_demo.write_batch(p_cycle uuid,p_ministry text,p_kind text,p_channel text,p_method text,p_items jsonb,p_letter text,p_confirmed boolean,p_zero boolean,p_replace uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c rc33_demo.cycles%rowtype; b uuid; old rc33_demo.batches%rowtype; parent rc33_demo.batches%rowtype; r jsonb; a record; aid uuid; k text; f text;l text; n integer; existing_count integer; chosen_count integer:=0;
begin
 perform rc32_demo.require_admin();
 select * into strict c from rc33_demo.cycles where id=p_cycle for update;
 if not exists(select 1 from rc32_demo.ministries where name=p_ministry) or p_kind is null or p_kind not in ('original','supplemental') or p_channel is null or p_channel not in ('walk_in','online_rehearsal') or p_method is null or p_method not in ('OTC','QR') or not coalesce(p_confirmed,false) or p_zero is null then raise exception 'Valid ministry, source, method and roster confirmation required';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>150 or octet_length(p_items::text)>150000 then raise exception 'Invalid fictional roster payload';end if;
 if p_kind='supplemental' then
  select * into strict parent from rc33_demo.batches where cycle_id=c.id and ministry=p_ministry and kind='original';
  if not(parent.status='closed_no_charge' or (parent.status='reviewed' and exists(select 1 from rc3_demo.applications x where x.id=parent.aggregate_id and x.status in ('awaiting_payment','renewed')))) then raise exception 'Original application must be closed or payment authorized before supplemental intake';end if;
  if p_zero then raise exception 'Supplemental application requires additional recommendations';end if;
 end if;
 n:=0;
 for r in select value from jsonb_array_elements(p_items) loop
  k:=r->>'proposal';if k is null or k not in ('renew','hold','no','new_member','ministry_assignment','identity_review') then raise exception 'Invalid proposal';end if;
  if k<>'no' then n:=n+1;end if;
 end loop;
 if n=0 then
  if not p_zero or nullif(trim(coalesce(p_letter,'')),'') is not null then raise exception 'Explicit zero declaration required';end if;
 else
  if p_zero or length(trim(coalesce(p_letter,''))) not between 1 and 150 or p_letter!~*'\.pdf$' then raise exception 'Recommendation PDF covering these names required';end if;
 end if;
 if p_replace is null then
 insert into rc33_demo.batches(cycle_id,ministry,kind,parent_id,channel,preferred_method,letter_name,zero_declaration,submitted_by)
 values(c.id,p_ministry,p_kind,parent.id,p_channel,p_method,case when n>0 then trim(p_letter) end,p_zero,auth.uid()) returning id into b;
 else
 select * into strict old from rc33_demo.batches where id=p_replace and cycle_id=c.id for update;
 if old.status<>'returned' or old.ministry<>p_ministry or old.kind<>p_kind or old.channel<>p_channel or old.aggregate_id is not null then raise exception 'Only the returned ungrouped ministry batch may be corrected';end if;
 b:=old.id;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(c.id,b,auth.uid(),'prior_revision_archived',jsonb_build_object('batch',to_jsonb(old),'items',(select jsonb_agg(to_jsonb(i)) from rc33_demo.items i where i.batch_id=b)));
 delete from rc33_demo.items where batch_id=b;
 update rc33_demo.batches set revision=revision+1,status='submitted',return_note=null,preferred_method=p_method,letter_name=case when n>0 then trim(p_letter) end,zero_declaration=p_zero,letter_reviewed_by=null,letter_reviewed_at=null,reviewed_by=null,reviewed_at=null,submitted_at=now() where id=b;
 end if;
 for r in select value from jsonb_array_elements(p_items) loop
  k:=r->>'proposal';aid:=nullif(r->>'assignment_id','')::uuid;
  if aid is not null then
   if k not in ('renew','hold','no','identity_review') then raise exception 'Invalid existing assignment proposal';end if;
   select z.id,rr.first_name,rr.last_name into strict a from rc33_demo.roster rr join rc3_demo.assignments z on z.id=rr.assignment_id where z.id=aid and z.parish=c.parish and z.ministry=p_ministry;
   f:=a.first_name;l:=a.last_name;chosen_count:=chosen_count+1;
  else
   if k not in ('new_member','ministry_assignment','identity_review') then raise exception 'Existing assignment ID required';end if;
   f:=trim(coalesce(r->>'first_name',''));l:=trim(coalesce(r->>'last_name',''));
   if length(f) not between 1 and 100 or length(l) not between 1 and 100 or f~'^[=+@-]' or l~'^[=+@-]' or f~'[[:cntrl:]]' or l~'[[:cntrl:]]' then raise exception 'Invalid fictional name';end if;
   if exists(select 1 from rc33_demo.roster rr join rc3_demo.assignments z on z.id=rr.assignment_id where z.parish=c.parish and z.ministry=p_ministry and rc33_demo.name_key(rr.first_name,rr.last_name)=rc33_demo.name_key(f,l)) then raise exception 'Existing assignment must be referenced by ID';end if;
  end if;
  if p_kind='supplemental' and k='no' then raise exception 'Supplemental batch contains additions only';end if;
  insert into rc33_demo.items(batch_id,cycle_id,ministry,assignment_id,first_name,last_name,name_key,proposal,decision)
  values(b,c.id,p_ministry,aid,f,l,rc33_demo.name_key(f,l),k,case when k='no' then 'excluded' else 'pending' end);
 end loop;
 if p_kind='original' then
  select count(*) into existing_count from rc33_demo.roster rr join rc3_demo.assignments z on z.id=rr.assignment_id where z.parish=c.parish and z.ministry=p_ministry;
  if chosen_count<>existing_count then raise exception 'Every existing ministry assignment needs an explicit roster decision';end if;
 end if;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(c.id,b,auth.uid(),'batch_submitted',jsonb_build_object('kind',p_kind,'channel',p_channel,'method',p_method,'recommended',n));
 return b;
end $$;
create function rc33_demo.submit_batch(p_cycle uuid,p_ministry text,p_kind text,p_channel text,p_method text,p_items jsonb,p_letter text,p_confirmed boolean,p_zero boolean) returns uuid language sql security definer set search_path='' as $$select rc33_demo.write_batch(p_cycle,p_ministry,p_kind,p_channel,p_method,p_items,p_letter,p_confirmed,p_zero,null)$$;
create function rc33_demo.review_letter(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b rc33_demo.batches%rowtype;
begin
 perform rc32_demo.require_admin();
 select * into strict b from rc33_demo.batches where id=p_batch for update;
 if b.status<>'submitted' or b.letter_reviewed_by is not null then raise exception 'Recommendation already decided or batch locked';end if;
 update rc33_demo.batches set letter_reviewed_by=auth.uid(),letter_reviewed_at=now() where id=b.id;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action) values(b.cycle_id,b.id,auth.uid(),'recommendation_reviewed');
end $$;
create function rc33_demo.review_item(p_batch uuid,p_item uuid,p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare b rc33_demo.batches%rowtype;
begin
 perform rc32_demo.require_admin();
 select * into strict b from rc33_demo.batches where id=p_batch for update;
 if b.status<>'submitted' or b.letter_reviewed_by is null or p_decision is null or p_decision not in ('approved','rejected') or (p_decision='rejected' and length(trim(coalesce(p_note,'')))<5) or length(coalesce(p_note,''))>300 then raise exception 'Reviewed recommendation and explicit individual decision required';end if;
 update rc33_demo.items set decision=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),note=trim(coalesce(p_note,'')) where id=p_item and batch_id=b.id and decision='pending';
 if not found then raise exception 'Assignment already decided or outside batch';end if;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(b.cycle_id,b.id,auth.uid(),'assignment_reviewed',jsonb_build_object('item',p_item,'decision',p_decision,'note',p_note));
end $$;
create function rc33_demo.complete_review(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b rc33_demo.batches%rowtype;
begin
 perform rc32_demo.require_admin();
 select * into strict b from rc33_demo.batches where id=p_batch for update;
 if b.status<>'submitted' or b.letter_reviewed_by is null or exists(select 1 from rc33_demo.items where batch_id=b.id and decision='pending') then raise exception 'All individual decisions and recommendation review required';end if;
 update rc33_demo.batches set status=case when exists(select 1 from rc33_demo.items where batch_id=b.id and decision='approved') then 'reviewed' else 'closed_no_charge' end,reviewed_by=auth.uid(),reviewed_at=now() where id=b.id;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action) values(b.cycle_id,b.id,auth.uid(),'review_completed');
end $$;
-- Explicit grouping happens only AFTER individual review. Existing RC3 authorized-payment/receipt
-- procedures handle the resulting bridge. No browser writes to the ledger or partial settlements.
create function rc33_demo.group_reviewed(p_cycle uuid,p_batches uuid[],p_method text) returns uuid language plpgsql security definer set search_path='' as $$
declare c rc33_demo.cycles%rowtype;b rc33_demo.batches%rowtype;i rc33_demo.items%rowtype;a uuid;target uuid;v_count int;v_ministry text;v_channel text;v_ref text;
begin
 perform rc32_demo.require_admin();
 select * into strict c from rc33_demo.cycles where id=p_cycle for update;
 if coalesce(cardinality(p_batches),0) not between 1 and 6 or (select count(distinct x) from unnest(p_batches) x)<>cardinality(p_batches) or p_method is null or p_method not in ('QR','OTC') then raise exception 'Select distinct reviewed batches and one settlement method';end if;
 v_count:=0;
 for b in select * from rc33_demo.batches where id=any(p_batches) order by id for update loop
  if b.cycle_id<>c.id or b.status<>'reviewed' or b.aggregate_id is not null or b.reviewed_by is null or b.preferred_method<>p_method then raise exception 'Batch outside cycle, already grouped, not reviewed or different payment method';end if;
  v_count:=v_count+1;v_ministry:=b.ministry;v_channel:=b.channel;
 end loop;
 if v_count<>cardinality(p_batches) then raise exception 'Missing batch';end if;
 if v_count>1 then v_ministry:='Consolidated Parish Renewal';end if;
 v_ref:='RN-DEMO-RC33-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into rc3_demo.applications(reference,parish,ministry,service_year,channel,status,submitted_by,reviewed_by,reviewed_at,review_note,preferred_payment_method)
 values(v_ref,c.parish,v_ministry,c.service_year,v_channel,'documents_approved',auth.uid(),auth.uid(),now(),'RC3.3: explicitly reviewed assignment group',p_method) returning id into a;
 for i in select * from rc33_demo.items where batch_id=any(p_batches) and decision='approved' order by id loop
  target:=i.assignment_id;
  if target is null then
   insert into rc3_demo.assignments(minister_label,parish,ministry) values('Sample '||i.first_name||' '||i.last_name,c.parish,i.ministry) returning id into target;
   insert into rc33_demo.roster values(target,i.first_name,i.last_name);
   update rc33_demo.items set assignment_id=target where id=i.id;
  end if;
  insert into rc3_demo.application_members(application_id,assignment_id,service_year) values(a,target,c.service_year);
 end loop;
 if not exists(select 1 from rc3_demo.application_members where application_id=a) then raise exception 'No approved assignments';end if;
 update rc33_demo.batches set aggregate_id=a where id=any(p_batches);
 insert into rc33_demo.events(cycle_id,actor,action,details) values(c.id,auth.uid(),'reviewed_batches_grouped',jsonb_build_object('application',a,'batches',p_batches,'method',p_method));
 insert into rc3_demo.events(application_id,action,actor_id) values(a,'rc33_independent_review_completed',auth.uid());
 return a;
end $$;
create function rc33_demo.snapshot(p_parish text,p_year integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin boolean:=coalesce((rc3_demo.roles()->>'admin')::boolean,false);finance boolean:=coalesce((rc3_demo.roles()->>'finance')::boolean,false);
begin
 if auth.uid() is null or not(admin or finance) then raise exception 'Authorized TEST operator required' using errcode='42501';end if;
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 then raise exception 'Unknown fictional parish or year';end if;
 return jsonb_build_object('roles',jsonb_build_object('admin',admin,'finance',finance),
 'cycle',(select id from rc33_demo.cycles where parish=p_parish and service_year=p_year),
 'roster',case when admin then coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'first',r.first_name,'last',r.last_name,'ministry',z.ministry,'renewal_date',z.renewal_date)) from rc33_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.parish=p_parish),'[]') else '[]'::jsonb end,
 'batches',coalesce((select jsonb_agg((to_jsonb(b)-'submitted_by'-'reviewed_by'-'letter_reviewed_by')||jsonb_build_object('letter_reviewed',b.letter_reviewed_by is not null,'financial_status',a.status,'due_centavos',a.due_centavos,'paid_centavos',a.paid_centavos,'payment_reference',p.payment_reference,'approved_count',(select count(*) from rc33_demo.items where batch_id=b.id and decision='approved'),'items',case when admin then (select coalesce(jsonb_agg(to_jsonb(i)-'reviewed_by'),'[]') from rc33_demo.items i where i.batch_id=b.id) else '[]'::jsonb end) order by b.submitted_at) from rc33_demo.batches b join rc33_demo.cycles c on c.id=b.cycle_id left join rc3_demo.applications a on a.id=b.aggregate_id left join rc3_demo.financial_links f on f.application_id=a.id left join public.fs_payment_requests p on p.id=f.payment_request_id where c.parish=p_parish and c.service_year=p_year and (admin or b.status='reviewed')),'[]'));
end $$;
create function public.rc33_demo_open_cycle(p_parish text,p_year integer) returns uuid language sql security invoker set search_path='' as $$select rc33_demo.open_cycle(p_parish,p_year)$$;
revoke all on function public.rc33_demo_open_cycle(text,integer) from public,anon,authenticated;
create function public.rc33_demo_submit_batch(p_cycle uuid,p_ministry text,p_kind text,p_channel text,p_method text,p_items jsonb,p_letter text,p_confirmed boolean,p_zero boolean) returns uuid language sql security invoker set search_path='' as $$select rc33_demo.submit_batch(p_cycle,p_ministry,p_kind,p_channel,p_method,p_items,p_letter,p_confirmed,p_zero)$$;
revoke all on function public.rc33_demo_submit_batch(uuid,text,text,text,text,jsonb,text,boolean,boolean) from public,anon,authenticated;
create function public.rc33_demo_review_letter(p_batch uuid) returns void language sql security invoker set search_path='' as $$select rc33_demo.review_letter(p_batch)$$;
revoke all on function public.rc33_demo_review_letter(uuid) from public,anon,authenticated;
create function public.rc33_demo_review_item(p_batch uuid,p_item uuid,p_decision text,p_note text) returns void language sql security invoker set search_path='' as $$select rc33_demo.review_item(p_batch,p_item,p_decision,p_note)$$;
revoke all on function public.rc33_demo_review_item(uuid,uuid,text,text) from public,anon,authenticated;
create function public.rc33_demo_complete_review(p_batch uuid) returns void language sql security invoker set search_path='' as $$select rc33_demo.complete_review(p_batch)$$;
revoke all on function public.rc33_demo_complete_review(uuid) from public,anon,authenticated;
create function public.rc33_demo_group_reviewed(p_cycle uuid,p_batches uuid[],p_method text) returns uuid language sql security invoker set search_path='' as $$select rc33_demo.group_reviewed(p_cycle,p_batches,p_method)$$;
revoke all on function public.rc33_demo_group_reviewed(uuid,uuid[],text) from public,anon,authenticated;
create function public.rc33_demo_snapshot(p_parish text,p_year integer) returns jsonb language sql security invoker set search_path='' as $$select rc33_demo.snapshot(p_parish,p_year)$$;
revoke all on function public.rc33_demo_snapshot(text,integer) from public,anon,authenticated;
revoke all on all functions in schema rc33_demo from public,anon,authenticated;
grant usage on schema rc33_demo to authenticated;
grant execute on function rc33_demo.open_cycle(text,integer),public.rc33_demo_open_cycle(text,integer) to authenticated;
grant execute on function rc33_demo.submit_batch(uuid,text,text,text,text,jsonb,text,boolean,boolean),public.rc33_demo_submit_batch(uuid,text,text,text,text,jsonb,text,boolean,boolean) to authenticated;
grant execute on function rc33_demo.review_letter(uuid),public.rc33_demo_review_letter(uuid) to authenticated;
grant execute on function rc33_demo.review_item(uuid,uuid,text,text),public.rc33_demo_review_item(uuid,uuid,text,text) to authenticated;
grant execute on function rc33_demo.complete_review(uuid),public.rc33_demo_complete_review(uuid) to authenticated;
grant execute on function rc33_demo.group_reviewed(uuid,uuid[],text),public.rc33_demo_group_reviewed(uuid,uuid[],text) to authenticated;
grant execute on function rc33_demo.snapshot(text,integer),public.rc33_demo_snapshot(text,integer) to authenticated;
