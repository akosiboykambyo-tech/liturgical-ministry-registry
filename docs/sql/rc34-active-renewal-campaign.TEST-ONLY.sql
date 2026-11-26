-- RC3.4 TEST ONLY. No production, actual member data, or live financial changes.
-- Single server-owned campaign. Only the database migration/operator may change it.
create table rc33_demo.renewal_campaign(
 singleton boolean primary key default true check(singleton),
 service_year integer not null check(service_year between 2026 and 2031),
 intake_open boolean not null default true
);
alter table rc33_demo.renewal_campaign enable row level security;
revoke all on rc33_demo.renewal_campaign from public,anon,authenticated;
insert into rc33_demo.renewal_campaign(singleton,service_year,intake_open) values(true,2027,true);
create function rc33_demo.campaign_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c rc33_demo.renewal_campaign%rowtype;roles jsonb:=rc3_demo.roles();
begin
 if auth.uid() is null or not(coalesce((roles->>'admin')::boolean,false) or coalesce((roles->>'finance')::boolean,false)) then raise exception 'Authorized TEST staff required' using errcode='42501';end if;
 select * into c from rc33_demo.renewal_campaign where singleton;
 return jsonb_build_object('service_year',c.service_year,'intake_open',coalesce(c.intake_open,false));
end $$;
create function public.rc34_demo_campaign_status() returns jsonb
language sql stable security invoker set search_path='' as $$select rc33_demo.campaign_status()$$;
revoke all on function rc33_demo.campaign_status(),public.rc34_demo_campaign_status() from public,anon,authenticated;
grant execute on function rc33_demo.campaign_status(),public.rc34_demo_campaign_status() to authenticated;
create function rc33_demo.assert_active_intake(p_year integer) returns void
language plpgsql security definer set search_path='' as $$
declare c rc33_demo.renewal_campaign%rowtype;
begin
 select * into c from rc33_demo.renewal_campaign where singleton for share;
 if not found or not c.intake_open or p_year is distinct from c.service_year then
  raise exception 'Renewal intake is not authorized for this service year' using errcode='23514';
 end if;
end $$;
-- Protect every intake path, including direct RPC calls and a forged channel value.
-- Existing review, return, grouping, payment and receipt actions do not change the submitted revision.
create function rc33_demo.guard_campaign_intake() returns trigger
language plpgsql security definer set search_path='' as $$
declare y integer;
begin
 if tg_table_name='cycles' then
  perform rc33_demo.assert_active_intake(new.service_year);
 elsif tg_table_name='drafts' then
  if tg_op='INSERT' or new.state in ('draft','submitted') then
   select service_year into strict y from rc33_demo.cycles where id=new.cycle_id;
   perform rc33_demo.assert_active_intake(y);
  end if;
 elsif tg_table_name='batches' then
  if tg_op='INSERT' then
   select service_year into strict y from rc33_demo.cycles where id=new.cycle_id;
   perform rc33_demo.assert_active_intake(y);
  elsif new.revision is distinct from old.revision or new.cycle_id is distinct from old.cycle_id then
   select service_year into strict y from rc33_demo.cycles where id=new.cycle_id;
   perform rc33_demo.assert_active_intake(y);
  end if;
 elsif tg_table_name='advances' then
  select service_year into strict y from rc33_demo.cycles where id=new.cycle_id;
  perform rc33_demo.assert_active_intake(y);
 end if;
 return new;
end $$;
create trigger rc34_campaign_cycle before insert on rc33_demo.cycles for each row execute function rc33_demo.guard_campaign_intake();
create trigger rc34_campaign_draft before insert or update on rc33_demo.drafts for each row execute function rc33_demo.guard_campaign_intake();
create trigger rc34_campaign_batch before insert or update on rc33_demo.batches for each row execute function rc33_demo.guard_campaign_intake();
create trigger rc34_campaign_advance before insert on rc33_demo.advances for each row execute function rc33_demo.guard_campaign_intake();
revoke all on function rc33_demo.assert_active_intake(integer),rc33_demo.guard_campaign_intake() from public,anon,authenticated;
-- Existing historical cycles can be opened read-only even if intake is closed.
create or replace function rc33_demo.open_cycle(p_parish text,p_year integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform rc32_demo.require_admin();
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 then raise exception 'Unknown fictional parish or year';end if;
 select id into v_id from rc33_demo.cycles where parish=p_parish and service_year=p_year;
 if found then return v_id;end if;
 perform rc33_demo.assert_active_intake(p_year);
 insert into rc33_demo.cycles(parish,service_year) values(p_parish,p_year) on conflict(parish,service_year) do nothing;
 select id into strict v_id from rc33_demo.cycles where parish=p_parish and service_year=p_year;return v_id;
end $$;

create or replace function rc33_demo.open_draft(p_cycle uuid,p_ministry text,p_kind text,p_channel text,p_replace uuid default null,p_takeover boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c rc33_demo.cycles%rowtype;d rc33_demo.drafts%rowtype;b rc33_demo.batches%rowtype;items jsonb;
begin
 perform rc32_demo.require_admin();select * into strict c from rc33_demo.cycles where id=p_cycle for update;
 perform rc33_demo.assert_active_intake(c.service_year);
 if p_kind is null or p_kind not in ('original','supplemental') or p_channel is null or p_channel not in ('walk_in','online_rehearsal') or not exists(select 1 from rc32_demo.ministries where name=p_ministry) then raise exception 'Invalid draft scope';end if;
 if p_replace is not null then
  select * into strict b from rc33_demo.batches where id=p_replace and cycle_id=c.id for update;
  if b.status<>'returned' or b.ministry<>p_ministry or b.kind<>p_kind or b.channel<>p_channel then raise exception 'Only the returned ministry may be corrected';end if;
 elsif p_kind='original' and exists(select 1 from rc33_demo.batches where cycle_id=c.id and ministry=p_ministry and kind='original') then
  raise exception 'Original ministry already submitted; view existing record';
 elsif p_kind='supplemental' and not exists(select 1 from rc33_demo.batches orig left join rc3_demo.applications a on a.id=orig.aggregate_id where orig.cycle_id=c.id and orig.ministry=p_ministry and orig.kind='original' and (orig.status='closed_no_charge' or (orig.status='reviewed' and a.status in ('awaiting_payment','renewed')))) then
  raise exception 'Original must be authorized or closed before supplements';
 end if;
 select * into d from rc33_demo.drafts where cycle_id=c.id and ministry=p_ministry and kind=p_kind and state='draft' for update;
 if found then
  if d.replace_batch is distinct from p_replace then raise exception 'Another draft is active for this ministry';end if;
  if d.channel=p_channel then return to_jsonb(d)-'created_by';end if;
  if p_channel<>'walk_in' or d.channel<>'online_rehearsal' or p_replace is not null or not coalesce(p_takeover,false) then raise exception 'A draft from the other intake channel is active; explicit staff takeover required';end if;
  update rc33_demo.drafts set state='superseded',revision=revision+1,updated_at=now() where id=d.id;
  insert into rc33_demo.events(cycle_id,actor,action,details) values(c.id,auth.uid(),'online_draft_superseded_by_walk_in',jsonb_build_object('draft',to_jsonb(d),'ministry',p_ministry));
 end if;
 if p_replace is not null then
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',i.assignment_id,'first_name',i.first_name,'last_name',i.last_name,'proposal',i.proposal,'proposed_first',i.proposed_first,'proposed_last',i.proposed_last)),'[]') into items from rc33_demo.items i where i.batch_id=b.id;
 elsif p_kind='original' then
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',z.id,'proposal','renew')),'[]') into items from rc33_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.parish=c.parish and z.ministry=p_ministry;
 else items:='[]';
 end if;
 insert into rc33_demo.drafts(cycle_id,ministry,kind,channel,replace_batch,payload,created_by) values(c.id,p_ministry,p_kind,p_channel,p_replace,jsonb_build_object('items',items,'method',coalesce(b.preferred_method,'OTC'),'confirmed',false,'letter',b.letter_name,'zero',false),auth.uid()) returning * into d;
 return to_jsonb(d)-'created_by';
end $$;
