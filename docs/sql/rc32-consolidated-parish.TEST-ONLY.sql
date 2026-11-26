-- RC3.2 ISOLATED TEST ONLY. No live member, encryption, credential or payment-provider changes.
set local lock_timeout='3s';
create schema rc32_demo;
revoke all on schema rc32_demo from public,anon,authenticated;
create table rc32_demo.ministries(name text primary key,ordinal integer unique not null);
insert into rc32_demo.ministries values
 ('Mother Butler Guild',1),('Ministry of Greeters and Collectors',2),('Extraordinary Ministers of Holy Communion',3),('Ministry of Lectors and Commentators',4),('Ministry of Liturgical Music',5),('Ministry of Altar Servers',6);
create table rc32_demo.roster(assignment_id uuid primary key references rc3_demo.assignments(id),first_name text not null,last_name text not null);
-- Separate, clearly identified fictional fixtures; legacy RC3.1 roster untouched.
with seeded as (
 insert into rc3_demo.assignments(minister_label,parish,ministry)
 select 'Sample '||n.first_name||' '||n.last_name,p.parish,m.name
 from (values('RC32 Sample Parish A'),('RC32 Sample Parish B')) p(parish)
 cross join rc32_demo.ministries m cross join (values('Maria','Santos'),('Jose','Reyes'),('Teresa','Cruz'),('Rafael','Garcia')) n(first_name,last_name)
 returning id,minister_label
)
insert into rc32_demo.roster select id,split_part(minister_label,' ',2),split_part(minister_label,' ',3) from seeded;
create table rc32_demo.submissions(
 id uuid primary key default gen_random_uuid(),reference text unique not null default ('RN-DEMO-RC32-'||upper(replace(gen_random_uuid()::text,'-',''))),
 parish text not null check(parish in ('RC32 Sample Parish A','RC32 Sample Parish B')),service_year integer not null check(service_year between 2026 and 2031),
 channel text not null check(channel in ('online_rehearsal','walk_in')),revision integer not null default 1,
 status text not null default 'draft' check(status in ('draft','submitted','returned','reviewed','closed_no_charge')),
 payload jsonb not null default '[]',submitted_payload jsonb,submitted_by uuid not null,created_at timestamptz not null default now(),
 submitted_at timestamptz,return_ministry text references rc32_demo.ministries(name),return_note text,
 aggregate_id uuid unique references rc3_demo.applications(id),unique(parish,service_year)
);
create table rc32_demo.letters(
 submission_id uuid references rc32_demo.submissions(id),ministry text references rc32_demo.ministries(name),filename text,received date,retain_until date,
 reviewed_by uuid,reviewed_at timestamptz,primary key(submission_id,ministry)
);
create table rc32_demo.items(
 id uuid primary key default gen_random_uuid(),submission_id uuid not null references rc32_demo.submissions(id),ministry text not null references rc32_demo.ministries(name),
 assignment_id uuid references rc3_demo.assignments(id),first_name text not null,last_name text not null,
 proposal text not null check(proposal in ('renew','hold','no','new_member','ministry_assignment','identity_review')),
 proposed_first text,proposed_last text,
 decision text not null default 'pending' check(decision in ('pending','approved','rejected','excluded')),
 reviewed_by uuid,reviewed_at timestamptz,review_note text,
 unique(submission_id,assignment_id)
);
create table rc32_demo.events(id bigint generated always as identity primary key,submission_id uuid not null references rc32_demo.submissions(id),actor uuid not null,action text not null,details jsonb not null default '{}',at timestamptz not null default now());
alter table rc32_demo.ministries enable row level security;
alter table rc32_demo.roster enable row level security;
alter table rc32_demo.submissions enable row level security;
alter table rc32_demo.letters enable row level security;
alter table rc32_demo.items enable row level security;
alter table rc32_demo.events enable row level security;
revoke all on all tables in schema rc32_demo from public,anon,authenticated;
create function rc32_demo.require_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce((rc3_demo.roles()->>'admin')::boolean,false) then raise exception 'Authorized TEST Registry operator required' using errcode='42501';end if;
end $$;
create function rc32_demo.guard_legacy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.parish like 'RC32 Sample Parish %' and (new.reference not like 'RN-DEMO-RC32-%' or new.ministry<>'Consolidated Parish Renewal' or new.status<>'documents_approved') then
  raise exception 'RC3.2 fixtures require the consolidated, assignment-reviewed submission path' using errcode='23514';
 end if;
 return new;
end $$;
create trigger rc32_demo_guard_legacy before insert on rc3_demo.applications for each row execute function rc32_demo.guard_legacy();
create function rc32_demo.open_draft(p_parish text,p_year integer,p_channel text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype;
begin
 perform rc32_demo.require_admin();
 if p_parish is null or p_parish not in ('RC32 Sample Parish A','RC32 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 or p_channel is null or p_channel not in ('walk_in','online_rehearsal') then raise exception 'Invalid fictional parish, year or source';end if;
 insert into rc32_demo.submissions(parish,service_year,channel,submitted_by) values(p_parish,p_year,p_channel,auth.uid()) on conflict(parish,service_year) do nothing;
 select * into strict s from rc32_demo.submissions where parish=p_parish and service_year=p_year;
 return to_jsonb(s)-'submitted_by';
end $$;
create function rc32_demo.save_draft(p_id uuid,p_revision integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype; m record;
begin
 perform rc32_demo.require_admin();
 select * into strict s from rc32_demo.submissions where id=p_id for update;
 if s.revision<>p_revision or s.status not in ('draft','returned') then raise exception 'Draft changed or is locked; reload before editing' using errcode='40001';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'array' or jsonb_array_length(p_payload)>6 or octet_length(p_payload::text)>250000 then raise exception 'Invalid draft payload';end if;
 if s.status='returned' then
  for m in select name from rc32_demo.ministries where name<>s.return_ministry loop
   if (select x from jsonb_array_elements(s.submitted_payload) x where x->>'ministry'=m.name) is distinct from (select x from jsonb_array_elements(p_payload) x where x->>'ministry'=m.name) then raise exception 'Only the returned ministry can be edited';end if;
  end loop;
 end if;
 update rc32_demo.submissions set payload=p_payload,revision=revision+1 where id=s.id returning * into s;
 insert into rc32_demo.events(submission_id,actor,action,details) values(s.id,auth.uid(),'draft_saved',jsonb_build_object('revision',s.revision));
 return to_jsonb(s)-'submitted_by';
end $$;
create function rc32_demo.submit(p_id uuid,p_revision integer,p_method text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype; m record; sec jsonb; it jsonb; rq jsonb; a record; n int; d date:=(now() at time zone 'Asia/Manila')::date; fn text; cid uuid; existing int; recounted int;
begin
 perform rc32_demo.require_admin();
 select * into strict s from rc32_demo.submissions where id=p_id for update;
 if s.status='submitted' and s.revision=p_revision+1 then return to_jsonb(s)-'submitted_by';end if;
 if s.revision<>p_revision or s.status not in ('draft','returned') then raise exception 'Draft changed or is locked; reload before submitting' using errcode='40001';end if;
 if p_method is null or p_method not in ('QR','OTC') then raise exception 'Choose payment preference';end if;
 if jsonb_typeof(s.payload)<>'array' or jsonb_array_length(s.payload)<>6 then raise exception 'All six ministries require explicit confirmation';end if;
 if (select count(distinct x->>'ministry') from jsonb_array_elements(s.payload) x)<>6 then raise exception 'Duplicate or missing ministry';end if;
 for m in select name from rc32_demo.ministries order by ordinal loop
  select x into sec from jsonb_array_elements(s.payload) x where x->>'ministry'=m.name;
  if sec is null or sec->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(sec->'items') is distinct from 'array' or jsonb_typeof(sec->'requests') is distinct from 'array' then raise exception 'Complete roster review for %',m.name;end if;
  if s.status='returned' and m.name<>s.return_ministry then continue;end if;
  if jsonb_array_length(sec->'requests')>100 then raise exception 'Too many fictional requests';end if;
  select count(*) into existing from rc32_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.parish=s.parish and z.ministry=m.name;
  if jsonb_array_length(sec->'items')<>existing or (select count(distinct x->>'id') from jsonb_array_elements(sec->'items') x)<>existing then raise exception 'Every official assignment needs one explicit decision in %',m.name;end if;
  n:=0;
  for it in select x from jsonb_array_elements(sec->'items') x loop
   select z.id,r.first_name,r.last_name into strict a from rc32_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.id=(it->>'id')::uuid and z.parish=s.parish and z.ministry=m.name;
   if it->>'decision' is null or it->>'decision' not in ('renew','no','hold') then raise exception 'Invalid roster decision';end if;
   if it->>'decision'<>'no' then n:=n+1;end if;
  end loop;
  n:=n+jsonb_array_length(sec->'requests');
  fn:=nullif(trim(coalesce(sec->'letter'->>'name','')),'');
  if n>0 and (fn is null or length(fn)>150 or fn!~*'\.pdf$' or sec->'letter'->'confirmed' is distinct from 'true'::jsonb) then raise exception 'Confirmed sample PDF recommendation required for %',m.name;end if;
  if n=0 and sec->'zeroDeclaration' is distinct from 'true'::jsonb then raise exception 'Explicit no-renewal declaration required for %',m.name;end if;
  -- Returned ministry only: preserve the other ministry decisions; previous revision is retained in events.
  delete from rc32_demo.items where submission_id=s.id and ministry=m.name;
  delete from rc32_demo.letters where submission_id=s.id and ministry=m.name;
  insert into rc32_demo.letters(submission_id,ministry,filename,received,retain_until) values(s.id,m.name,case when n>0 then fn end,case when n>0 then d end,case when n>0 then (d+interval '12 months')::date end);
  for it in select x from jsonb_array_elements(sec->'items') x loop
   select z.id,r.first_name,r.last_name into strict a from rc32_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.id=(it->>'id')::uuid and z.parish=s.parish and z.ministry=m.name;
   insert into rc32_demo.items(submission_id,ministry,assignment_id,first_name,last_name,proposal,decision) values(s.id,m.name,a.id,a.first_name,a.last_name,it->>'decision',case when it->>'decision'='no' then 'excluded' else 'pending' end);
  end loop;
  for rq in select x from jsonb_array_elements(sec->'requests') x loop
   if rq->>'kind' is null or rq->>'kind' not in ('new_member','ministry_assignment','identity_review') or length(trim(coalesce(rq->>'first',''))) not between 1 and 100 or length(trim(coalesce(rq->>'last',''))) not between 1 and 100 or (rq->>'first')~'^[=+@-]' or (rq->>'last')~'^[=+@-]' then raise exception 'Invalid fictional name request';end if;
   cid:=nullif(rq->>'candidateId','')::uuid;
   if cid is not null then
    if rq->>'kind'<>'identity_review' then raise exception 'Only identity correction can link a same-ministry candidate';end if;
    update rc32_demo.items set proposed_first=trim(rq->>'first'),proposed_last=trim(rq->>'last'),proposal='identity_review' where submission_id=s.id and ministry=m.name and assignment_id=cid and proposal='hold' and proposed_first is null;
    get diagnostics recounted=row_count;if recounted<>1 then raise exception 'Invalid or duplicate correction candidate';end if;
   else
    if exists(select 1 from rc32_demo.items x where x.submission_id=s.id and x.ministry=m.name and lower(trim(x.first_name))=lower(trim(rq->>'first')) and lower(trim(x.last_name))=lower(trim(rq->>'last'))) then raise exception 'Duplicate proposed assignment';end if;
    insert into rc32_demo.items(submission_id,ministry,first_name,last_name,proposal) values(s.id,m.name,trim(rq->>'first'),trim(rq->>'last'),rq->>'kind');
   end if;
  end loop;
 end loop;
 insert into rc32_demo.events(submission_id,actor,action,details) values(s.id,auth.uid(),case when s.status='returned' then 'correction_resubmitted' else 'submitted' end,jsonb_build_object('previous',s.submitted_payload,'payload',s.payload,'method',p_method,'revision',s.revision));
 update rc32_demo.submissions set submitted_payload=payload,status='submitted',revision=revision+1,submitted_at=now(),return_ministry=null,return_note=null where id=s.id returning * into s;
 return to_jsonb(s)-'submitted_by';
end $$;
create function rc32_demo.review_letter(p_id uuid,p_ministry text,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype;
begin
 perform rc32_demo.require_admin();select * into strict s from rc32_demo.submissions where id=p_id for update;
 if s.status<>'submitted' or s.revision<>p_revision then raise exception 'Submission changed; refresh';end if;
 update rc32_demo.letters set reviewed_by=auth.uid(),reviewed_at=now() where submission_id=s.id and ministry=p_ministry;
 if not found then raise exception 'Ministry not found';end if;
 insert into rc32_demo.events(submission_id,actor,action,details) values(s.id,auth.uid(),'ministry_letter_reviewed',jsonb_build_object('ministry',p_ministry));
end $$;
create function rc32_demo.review_item(p_id uuid,p_item uuid,p_revision integer,p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype; i rc32_demo.items%rowtype;
begin
 perform rc32_demo.require_admin();select * into strict s from rc32_demo.submissions where id=p_id for update;
 if s.status<>'submitted' or s.revision<>p_revision or p_decision is null or p_decision not in ('approved','rejected') or (p_decision='rejected' and length(trim(coalesce(p_note,'')))<5) or length(coalesce(p_note,''))>300 then raise exception 'Current revision, explicit decision and rejection reason required';end if;
 select * into strict i from rc32_demo.items where submission_id=s.id and id=p_item for update;
 if i.proposal='no' or i.decision<>'pending' then raise exception 'Assignment is excluded or already independently decided';end if;
 update rc32_demo.items set decision=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(coalesce(p_note,'')) where id=i.id;
 insert into rc32_demo.events(submission_id,actor,action,details) values(s.id,auth.uid(),'assignment_reviewed',jsonb_build_object('item',i.id,'decision',p_decision,'note',p_note));
end $$;
create function rc32_demo.return_ministry(p_id uuid,p_ministry text,p_revision integer,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype;
begin
 perform rc32_demo.require_admin();select * into strict s from rc32_demo.submissions where id=p_id for update;
 if s.status<>'submitted' or s.revision<>p_revision or length(trim(coalesce(p_note,''))) not between 10 and 300 or not exists(select 1 from rc32_demo.ministries where name=p_ministry) then raise exception 'Current submission, ministry and specific return reason required';end if;
 insert into rc32_demo.events(submission_id,actor,action,details) values(s.id,auth.uid(),'ministry_returned',jsonb_build_object('ministry',p_ministry,'reason',p_note,'items',(select jsonb_agg(to_jsonb(i)) from rc32_demo.items i where i.submission_id=s.id and i.ministry=p_ministry),'letter',(select to_jsonb(l) from rc32_demo.letters l where l.submission_id=s.id and l.ministry=p_ministry)));
 update rc32_demo.submissions set status='returned',return_ministry=p_ministry,return_note=trim(p_note),revision=revision+1 where id=s.id;
end $$;
create function rc32_demo.finalize(p_id uuid,p_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype;i rc32_demo.items%rowtype; a uuid; target uuid; expected int; actual int; preferred text;
begin
 perform rc32_demo.require_admin();select * into strict s from rc32_demo.submissions where id=p_id for update;
 if s.status='reviewed' then return s.aggregate_id;end if;
 if s.status<>'submitted' or s.revision<>p_revision then raise exception 'Current submitted revision required';end if;
 if (select count(*) from rc32_demo.letters where submission_id=s.id and reviewed_by is not null)<>6 or exists(select 1 from rc32_demo.items where submission_id=s.id and decision='pending') then raise exception 'All ministries and individual recommendations must be decided';end if;
 select count(*) into expected from rc32_demo.items where submission_id=s.id and decision='approved';
 if expected=0 then
  update rc32_demo.submissions set status='closed_no_charge',revision=revision+1 where id=s.id;
  insert into rc32_demo.events(submission_id,actor,action) values(s.id,auth.uid(),'closed_no_charge');return null;
 end if;
 select details->>'method' into preferred from rc32_demo.events where submission_id=s.id and action in ('submitted','correction_resubmitted') order by id desc limit 1;
 insert into rc3_demo.applications(reference,parish,ministry,service_year,channel,status,submitted_by,reviewed_by,reviewed_at,review_note,preferred_payment_method)
 values(s.reference,s.parish,'Consolidated Parish Renewal',s.service_year,s.channel,'documents_approved',s.submitted_by,auth.uid(),now(),'RC3.2 — six ministry requirements and explicit assignment decisions completed',preferred) returning id into a;
 for i in select * from rc32_demo.items where submission_id=s.id and decision='approved' order by id loop
  target:=i.assignment_id;
  if target is null then
   insert into rc3_demo.assignments(minister_label,parish,ministry) values('Sample '||i.first_name||' '||i.last_name,s.parish,i.ministry) returning id into target;
   insert into rc32_demo.roster(assignment_id,first_name,last_name) values(target,i.first_name,i.last_name);
   update rc32_demo.items set assignment_id=target where id=i.id;
  end if;
  -- Existing name corrections are review records only; no identity rewrite from a financial application.
  insert into rc3_demo.application_members(application_id,assignment_id,service_year) values(a,target,s.service_year);
 end loop;
 select count(*) into actual from rc3_demo.application_members where application_id=a;
 if actual<>expected then raise exception 'Approved roster integrity check failed';end if;
 insert into rc3_demo.events(application_id,action,actor_id) values(a,'rc32_consolidated_documents_approved',auth.uid());
 update rc32_demo.submissions set status='reviewed',aggregate_id=a,revision=revision+1 where id=s.id;
 insert into rc32_demo.events(submission_id,actor,action,details) values(s.id,auth.uid(),'consolidated_review_completed',jsonb_build_object('application_id',a,'approved_count',expected));
 return a;
end $$;
create function rc32_demo.snapshot(p_parish text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin boolean:=coalesce((rc3_demo.roles()->>'admin')::boolean,false); finance boolean:=coalesce((rc3_demo.roles()->>'finance')::boolean,false);
begin
 if auth.uid() is null or not(admin or finance) then raise exception 'Authorized TEST operator required' using errcode='42501';end if;
 if p_parish is not null and p_parish not in ('RC32 Sample Parish A','RC32 Sample Parish B') then raise exception 'Unknown fictional parish';end if;
 return jsonb_build_object('roles',jsonb_build_object('admin',admin,'finance',finance),
 'roster',case when admin then coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'first',r.first_name,'last',r.last_name,'parish',z.parish,'ministry',z.ministry,'renewal_date',z.renewal_date,'expiration_date',z.expiration_date) order by z.parish,z.ministry,r.last_name,r.first_name) from rc32_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where p_parish is null or z.parish=p_parish),'[]') else '[]'::jsonb end,
 'submissions',coalesce((select jsonb_agg((to_jsonb(s)-'submitted_by'-'payload'-'submitted_payload')||jsonb_build_object('payload',case when admin then s.payload else '[]'::jsonb end,'financial_status',a.status,'due_centavos',a.due_centavos,'paid_centavos',a.paid_centavos,'payment_reference',p.payment_reference,'qr_prepared',exists(select 1 from public.fs_payment_claims c where c.payment_request_id=p.id),'letters',case when admin then (select coalesce(jsonb_agg(to_jsonb(l)-'reviewed_by'||jsonb_build_object('reviewed',l.reviewed_by is not null)),'[]') from rc32_demo.letters l where l.submission_id=s.id) else '[]'::jsonb end,'items',case when admin then (select coalesce(jsonb_agg(to_jsonb(i)-'reviewed_by' order by i.ministry,i.last_name,i.first_name),'[]') from rc32_demo.items i where i.submission_id=s.id) else '[]'::jsonb end,'breakdown',(select coalesce(jsonb_agg(to_jsonb(b) order by b.ministry),'[]') from (select ministry,count(*) as count from rc32_demo.items where submission_id=s.id and decision='approved' group by ministry)b)) order by s.created_at desc) from rc32_demo.submissions s left join rc3_demo.applications a on a.id=s.aggregate_id left join rc3_demo.financial_links f on f.application_id=a.id left join public.fs_payment_requests p on p.id=f.payment_request_id where (p_parish is null or s.parish=p_parish) and (admin or (finance and s.status='reviewed'))),'[]'));
end $$;

create function public.rc32_demo_open_draft(p_parish text,p_year integer,p_channel text) returns jsonb language sql security invoker set search_path='' as $$select rc32_demo.open_draft(p_parish,p_year,p_channel)$$;
revoke all on function public.rc32_demo_open_draft(text,integer,text) from public,anon,authenticated;
create function public.rc32_demo_save_draft(p_id uuid,p_revision integer,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select rc32_demo.save_draft(p_id,p_revision,p_payload)$$;
revoke all on function public.rc32_demo_save_draft(uuid,integer,jsonb) from public,anon,authenticated;
create function public.rc32_demo_submit(p_id uuid,p_revision integer,p_method text) returns jsonb language sql security invoker set search_path='' as $$select rc32_demo.submit(p_id,p_revision,p_method)$$;
revoke all on function public.rc32_demo_submit(uuid,integer,text) from public,anon,authenticated;
create function public.rc32_demo_review_letter(p_id uuid,p_ministry text,p_revision integer) returns void language sql security invoker set search_path='' as $$select rc32_demo.review_letter(p_id,p_ministry,p_revision)$$;
revoke all on function public.rc32_demo_review_letter(uuid,text,integer) from public,anon,authenticated;
create function public.rc32_demo_review_item(p_id uuid,p_item uuid,p_revision integer,p_decision text,p_note text) returns void language sql security invoker set search_path='' as $$select rc32_demo.review_item(p_id,p_item,p_revision,p_decision,p_note)$$;
revoke all on function public.rc32_demo_review_item(uuid,uuid,integer,text,text) from public,anon,authenticated;
create function public.rc32_demo_return_ministry(p_id uuid,p_ministry text,p_revision integer,p_note text) returns void language sql security invoker set search_path='' as $$select rc32_demo.return_ministry(p_id,p_ministry,p_revision,p_note)$$;
revoke all on function public.rc32_demo_return_ministry(uuid,text,integer,text) from public,anon,authenticated;
create function public.rc32_demo_finalize(p_id uuid,p_revision integer) returns uuid language sql security invoker set search_path='' as $$select rc32_demo.finalize(p_id,p_revision)$$;
revoke all on function public.rc32_demo_finalize(uuid,integer) from public,anon,authenticated;
create function public.rc32_demo_snapshot(p_parish text default null) returns jsonb language sql security invoker set search_path='' as $$select rc32_demo.snapshot(p_parish)$$;
revoke all on function public.rc32_demo_snapshot(text) from public,anon,authenticated;
revoke all on all functions in schema rc32_demo from public,anon,authenticated;
grant usage on schema rc32_demo to authenticated;
grant execute on function rc32_demo.open_draft(text,integer,text),public.rc32_demo_open_draft(text,integer,text) to authenticated;
grant execute on function rc32_demo.save_draft(uuid,integer,jsonb),public.rc32_demo_save_draft(uuid,integer,jsonb) to authenticated;
grant execute on function rc32_demo.submit(uuid,integer,text),public.rc32_demo_submit(uuid,integer,text) to authenticated;
grant execute on function rc32_demo.review_letter(uuid,text,integer),public.rc32_demo_review_letter(uuid,text,integer) to authenticated;
grant execute on function rc32_demo.review_item(uuid,uuid,integer,text,text),public.rc32_demo_review_item(uuid,uuid,integer,text,text) to authenticated;
grant execute on function rc32_demo.return_ministry(uuid,text,integer,text),public.rc32_demo_return_ministry(uuid,text,integer,text) to authenticated;
grant execute on function rc32_demo.finalize(uuid,integer),public.rc32_demo_finalize(uuid,integer) to authenticated;
grant execute on function rc32_demo.snapshot(text),public.rc32_demo_snapshot(text) to authenticated;
