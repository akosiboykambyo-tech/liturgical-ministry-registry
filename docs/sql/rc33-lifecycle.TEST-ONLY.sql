-- Versioned staff-assisted rehearsal drafts; all calls remain Registry TEST restricted.
create table rc33_demo.drafts(
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null references rc33_demo.cycles(id),ministry text not null references rc32_demo.ministries(name),
 kind text not null check(kind in ('original','supplemental')),channel text not null check(channel in ('walk_in','online_rehearsal')),
 revision integer not null default 1,payload jsonb not null default '{}',replace_batch uuid references rc33_demo.batches(id),submitted_batch uuid references rc33_demo.batches(id),
 state text not null default 'draft' check(state in ('draft','submitted','superseded')),updated_at timestamptz not null default now(),
 created_by uuid not null
);
create unique index rc33_active_draft on rc33_demo.drafts(cycle_id,ministry,kind) where state='draft';
alter table rc33_demo.drafts enable row level security;
revoke all on rc33_demo.drafts from public,anon,authenticated;
create table rc33_demo.documents(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references rc33_demo.batches(id),revision integer not null,
 filename text not null,received date not null,retain_until date not null,contents bytea not null,unique(batch_id,revision)
);
alter table rc33_demo.documents enable row level security;
revoke all on rc33_demo.documents from public,anon,authenticated;
create function rc33_demo.make_document(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b rc33_demo.batches%rowtype;c rc33_demo.cycles%rowtype; names text[];d date:=(now() at time zone 'Asia/Manila')::date;
begin
 select * into strict b from rc33_demo.batches where id=p_batch;
 if b.letter_name is null then return;end if;
 select * into strict c from rc33_demo.cycles where id=b.cycle_id;
 select coalesce(array_agg(first_name||' '||last_name||' - '||proposal order by last_name,first_name),array[]::text[]) into names from rc33_demo.items where batch_id=b.id and proposal<>'no';
 insert into rc33_demo.documents(batch_id,revision,filename,received,retain_until,contents)
 values(b.id,b.revision,b.letter_name,d,(d+interval '12 months')::date,rc32_demo.sample_pdf(array['COWL-DOK | Liturgical Ministry Registry','DEMONSTRATION ONLY - NOT AN OFFICIAL DOCUMENT',c.parish,b.ministry,'Service year: '||c.service_year::text,'Reference: '||b.reference,'Revision: '||b.revision::text,'Recommended fictional assignments:']||names||array['Generated fictional evidence only. No priest signature or actual uploaded file.']));
end $$;
-- Generate immutable fictional PDF per submitted revision, after all items exist.
create function rc33_demo.document_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.action='batch_submitted' then perform rc33_demo.make_document(new.batch_id);end if;
 return new;
end $$;
create trigger rc33_document_after_submit after insert on rc33_demo.events for each row execute function rc33_demo.document_event();
create function rc33_demo.open_draft(p_cycle uuid,p_ministry text,p_kind text,p_channel text,p_replace uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c rc33_demo.cycles%rowtype;d rc33_demo.drafts%rowtype;b rc33_demo.batches%rowtype;items jsonb;
begin
 perform rc32_demo.require_admin();select * into strict c from rc33_demo.cycles where id=p_cycle for update;
 if p_kind is null or p_kind not in ('original','supplemental') or p_channel is null or p_channel not in ('walk_in','online_rehearsal') or not exists(select 1 from rc32_demo.ministries where name=p_ministry) then raise exception 'Invalid draft scope';end if;
 if p_replace is not null then
  select * into strict b from rc33_demo.batches where id=p_replace and cycle_id=c.id for update;
  if b.status<>'returned' or b.ministry<>p_ministry or b.kind<>p_kind or b.channel<>p_channel then raise exception 'Only the returned ministry may be corrected';end if;
 elsif p_kind='original' and exists(select 1 from rc33_demo.batches where cycle_id=c.id and ministry=p_ministry and kind='original') then
  raise exception 'Original ministry already submitted; view existing record';
 elsif p_kind='supplemental' and not exists(select 1 from rc33_demo.batches b left join rc3_demo.applications a on a.id=b.aggregate_id where b.cycle_id=c.id and b.ministry=p_ministry and b.kind='original' and (b.status='closed_no_charge' or (b.status='reviewed' and a.status in ('awaiting_payment','renewed')))) then
  raise exception 'Original must be authorized or closed before supplements';
 end if;
 select * into d from rc33_demo.drafts where cycle_id=c.id and ministry=p_ministry and kind=p_kind and state='draft' for update;
 if found then
  if d.replace_batch is distinct from p_replace then raise exception 'Another draft is active for this ministry';end if;
  return to_jsonb(d)-'created_by';
 end if;
 if p_replace is not null then
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',i.assignment_id,'first_name',i.first_name,'last_name',i.last_name,'proposal',i.proposal)),'[]') into items from rc33_demo.items i where i.batch_id=b.id;
 elsif p_kind='original' then
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',z.id,'proposal','renew')),'[]') into items from rc33_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.parish=c.parish and z.ministry=p_ministry;
 else items:='[]';
 end if;
 insert into rc33_demo.drafts(cycle_id,ministry,kind,channel,replace_batch,payload,created_by) values(c.id,p_ministry,p_kind,p_channel,p_replace,jsonb_build_object('items',items,'method',coalesce(b.preferred_method,'OTC'),'confirmed',false,'letter',b.letter_name,'zero',false),auth.uid()) returning * into d;
 return to_jsonb(d)-'created_by';
end $$;
create function rc33_demo.save_draft(p_id uuid,p_revision integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d rc33_demo.drafts%rowtype;c uuid;
begin
 perform rc32_demo.require_admin();
 select cycle_id into strict c from rc33_demo.drafts where id=p_id;
 perform 1 from rc33_demo.cycles where id=c for update;
 select * into strict d from rc33_demo.drafts where id=p_id for update;
 if d.state<>'draft' or d.revision is distinct from p_revision then raise exception 'Draft changed or was submitted elsewhere; reload' using errcode='40001';end if;
 if d.kind='original' and d.replace_batch is null and exists(select 1 from rc33_demo.batches b where b.cycle_id=c and b.ministry=d.ministry and b.kind='original') then raise exception 'Walk-in or online original already exists; reload cycle' using errcode='40001';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>150 or octet_length(p_payload::text)>150000 then raise exception 'Invalid draft';end if;
 update rc33_demo.drafts set payload=p_payload,revision=revision+1,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)-'created_by';
end $$;
create function rc33_demo.submit_draft(p_id uuid,p_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare d rc33_demo.drafts%rowtype;c uuid;b uuid;
begin
 perform rc32_demo.require_admin();
 select cycle_id into strict c from rc33_demo.drafts where id=p_id;
 perform 1 from rc33_demo.cycles where id=c for update;
 select * into strict d from rc33_demo.drafts where id=p_id for update;
 if d.state='submitted' and d.revision=p_revision+1 then return d.submitted_batch;end if;
 if d.state<>'draft' or d.revision is distinct from p_revision then raise exception 'Draft changed; reload' using errcode='40001';end if;
 b:=rc33_demo.write_batch(d.cycle_id,d.ministry,d.kind,d.channel,d.payload->>'method',d.payload->'items',d.payload->>'letter',(d.payload->>'confirmed')::boolean,(d.payload->>'zero')::boolean,d.replace_batch);
 update rc33_demo.drafts set state='submitted',submitted_batch=b,revision=revision+1,updated_at=now() where id=d.id;
 return b;
end $$;
create function rc33_demo.return_batch(p_batch uuid,p_revision integer,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare b rc33_demo.batches%rowtype;c uuid;
begin
 perform rc32_demo.require_admin();
 select cycle_id into strict c from rc33_demo.batches where id=p_batch;
 perform 1 from rc33_demo.cycles where id=c for update;
 select * into strict b from rc33_demo.batches where id=p_batch for update;
 if b.status<>'submitted' or b.aggregate_id is not null or b.revision is distinct from p_revision or length(trim(coalesce(p_note,''))) not between 10 and 300 then raise exception 'Current ungrouped batch and specific reason required';end if;
 update rc33_demo.batches set status='returned',return_note=trim(p_note) where id=b.id;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(c,b.id,auth.uid(),'batch_returned',jsonb_build_object('reason',p_note,'revision',b.revision));
end $$;
create function rc33_demo.read_letter(p_batch uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d rc33_demo.documents%rowtype;
begin
 perform rc32_demo.require_admin();
 select * into strict d from rc33_demo.documents where batch_id=p_batch order by revision desc limit 1;
 return jsonb_build_object('filename',d.filename,'base64',encode(d.contents,'base64'),'retain_until',d.retain_until);
end $$;
create function public.rc33_demo_open_draft(p_cycle uuid,p_ministry text,p_kind text,p_channel text,p_replace uuid default null) returns jsonb language sql security invoker set search_path='' as $$select rc33_demo.open_draft(p_cycle,p_ministry,p_kind,p_channel,p_replace)$$;
revoke all on function rc33_demo.open_draft(uuid,text,text,text,uuid),public.rc33_demo_open_draft(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function rc33_demo.open_draft(uuid,text,text,text,uuid),public.rc33_demo_open_draft(uuid,text,text,text,uuid) to authenticated;
create function public.rc33_demo_save_draft(p_id uuid,p_revision integer,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select rc33_demo.save_draft(p_id,p_revision,p_payload)$$;
revoke all on function rc33_demo.save_draft(uuid,integer,jsonb),public.rc33_demo_save_draft(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function rc33_demo.save_draft(uuid,integer,jsonb),public.rc33_demo_save_draft(uuid,integer,jsonb) to authenticated;
create function public.rc33_demo_submit_draft(p_id uuid,p_revision integer) returns uuid language sql security invoker set search_path='' as $$select rc33_demo.submit_draft(p_id,p_revision)$$;
revoke all on function rc33_demo.submit_draft(uuid,integer),public.rc33_demo_submit_draft(uuid,integer) from public,anon,authenticated;
grant execute on function rc33_demo.submit_draft(uuid,integer),public.rc33_demo_submit_draft(uuid,integer) to authenticated;
create function public.rc33_demo_return_batch(p_batch uuid,p_revision integer,p_note text) returns void language sql security invoker set search_path='' as $$select rc33_demo.return_batch(p_batch,p_revision,p_note)$$;
revoke all on function rc33_demo.return_batch(uuid,integer,text),public.rc33_demo_return_batch(uuid,integer,text) from public,anon,authenticated;
grant execute on function rc33_demo.return_batch(uuid,integer,text),public.rc33_demo_return_batch(uuid,integer,text) to authenticated;
create function public.rc33_demo_read_letter(p_batch uuid) returns jsonb language sql security invoker set search_path='' as $$select rc33_demo.read_letter(p_batch)$$;
revoke all on function rc33_demo.read_letter(uuid),public.rc33_demo_read_letter(uuid) from public,anon,authenticated;
grant execute on function rc33_demo.read_letter(uuid),public.rc33_demo_read_letter(uuid) to authenticated;
revoke all on function rc33_demo.make_document(uuid),rc33_demo.document_event() from public,anon,authenticated;
