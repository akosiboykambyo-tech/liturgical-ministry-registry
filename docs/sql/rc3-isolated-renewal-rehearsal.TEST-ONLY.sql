-- TEST ONLY: isolated RC3 rehearsal. No writes to members, member_ministries, or RC2 financial ledgers.
create schema rc3_demo;
revoke all on schema rc3_demo from public,anon,authenticated;
create table rc3_demo.assignments(
 id uuid primary key default gen_random_uuid(), minister_label text not null, parish text not null, ministry text not null,
 renewal_date date, expiration_date date, unique(minister_label,parish,ministry)
);
create table rc3_demo.applications(
 id uuid primary key default gen_random_uuid(), reference text not null unique, parish text not null, ministry text not null,
 service_year integer not null check(service_year between 2026 and 2031), channel text not null check(channel in ('online_rehearsal','walk_in')),
 status text not null default 'submitted' check(status in ('submitted','documents_approved','awaiting_payment','renewed','returned')),
 submitted_by uuid not null, submitted_at timestamptz not null default now(), reviewed_by uuid, reviewed_at timestamptz,
 authorized_by uuid, authorized_at timestamptz, due_centavos bigint, paid_centavos bigint not null default 0,
 renewed_at timestamptz, review_note text, check(paid_centavos>=0 and (due_centavos is null or paid_centavos<=due_centavos))
);
create table rc3_demo.application_members(
 application_id uuid not null references rc3_demo.applications(id), assignment_id uuid not null references rc3_demo.assignments(id),
 service_year integer not null, primary key(application_id,assignment_id), unique(assignment_id,service_year)
);
create table rc3_demo.payments(
 id uuid primary key default gen_random_uuid(), application_id uuid not null unique references rc3_demo.applications(id),
 amount_centavos bigint not null check(amount_centavos>0), recorded_by uuid not null, recorded_at timestamptz not null default now()
);
create table rc3_demo.events(
 id bigint generated always as identity primary key, application_id uuid not null references rc3_demo.applications(id),
 action text not null, actor_id uuid not null, happened_at timestamptz not null default now()
);
alter table rc3_demo.assignments enable row level security;
alter table rc3_demo.applications enable row level security;
alter table rc3_demo.application_members enable row level security;
alter table rc3_demo.payments enable row level security;
alter table rc3_demo.events enable row level security;
revoke all on all tables in schema rc3_demo from public,anon,authenticated;
insert into rc3_demo.assignments(minister_label,parish,ministry)
select 'Sample minister '||lpad(i::text,2,'0'),p,m from generate_series(1,12) i cross join (values('Sample Parish A'),('Sample Parish B')) par(p) cross join (values('Ministry of Lectors and Commentators'),('Ministry of Altar Servers')) min(m);
create function rc3_demo.roles() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('admin',auth.uid() is not null and exists(select 1 from registry_private.registration_administrators a where a.user_id=auth.uid() and a.active and a.revoked_at is null),
 'finance',auth.uid() is not null and exists(select 1 from public.fs_staff_grants g where g.user_id=auth.uid() and g.role_code='cowl_finance_verifier' and g.revoked_at is null and g.granted_at<=now() and (g.expires_at is null or g.expires_at>now())));
$$;
create function public.rc3_demo_access() returns jsonb language sql stable security invoker set search_path='' as $$select rc3_demo.roles()$$;
create function rc3_demo.snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare roles jsonb:=rc3_demo.roles(); admin boolean:=(roles->>'admin')::boolean; finance boolean:=(roles->>'finance')::boolean;
begin
 if not (admin or finance) then raise exception 'Authorized TEST role required' using errcode='42501'; end if;
 return jsonb_build_object('roles',roles,'assignments',case when admin then coalesce((select jsonb_agg(to_jsonb(a) order by a.parish,a.ministry,a.minister_label) from rc3_demo.assignments a),'[]'::jsonb) else '[]'::jsonb end,
 'applications',coalesce((select jsonb_agg(to_jsonb(a)-'submitted_by'-'reviewed_by'-'authorized_by'||jsonb_build_object('members',(select count(*) from rc3_demo.application_members m where m.application_id=a.id)) order by a.submitted_at desc) from rc3_demo.applications a where admin or (finance and a.status in ('documents_approved','awaiting_payment','renewed'))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)-'actor_id' order by e.id desc) from (select ev.* from rc3_demo.events ev join rc3_demo.applications a on a.id=ev.application_id where admin or (finance and a.status in ('documents_approved','awaiting_payment','renewed')) order by ev.id desc limit 100) e),'[]'::jsonb));
end $$;
create function public.rc3_demo_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$select rc3_demo.snapshot()$$;
create function rc3_demo.submit(p_channel text,p_year integer,p_assignment_ids uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare roles jsonb:=rc3_demo.roles(); actor uuid:=auth.uid(); b uuid; p text; m text; n integer; ref text;
begin
 if not (roles->>'admin')::boolean then raise exception 'Registry administrator required' using errcode='42501'; end if;
 if p_channel is null or p_channel not in ('online_rehearsal','walk_in') or p_year is null or p_year not between 2026 and 2031 or coalesce(cardinality(p_assignment_ids),0) not between 1 and 48 then raise exception 'Select a valid channel, service year and roster'; end if;
 select count(*),min(a.parish),min(a.ministry) into n,p,m from rc3_demo.assignments a where a.id=any(p_assignment_ids);
 if n<>cardinality(p_assignment_ids) or exists(select 1 from rc3_demo.assignments a where a.id=any(p_assignment_ids) and (a.parish<>p or a.ministry<>m)) then raise exception 'Choose distinct assignments for a single parish and ministry'; end if;
 ref:='RN-DEMO-'||p_year||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into rc3_demo.applications(reference,parish,ministry,service_year,channel,submitted_by) values(ref,p,m,p_year,p_channel,actor) returning id into b;
 insert into rc3_demo.application_members(application_id,assignment_id,service_year) select b,x,p_year from unnest(p_assignment_ids) x;
 insert into rc3_demo.events(application_id,action,actor_id) values(b,'application_submitted',actor); return b;
end $$;
create function public.rc3_demo_submit(p_channel text,p_year integer,p_assignment_ids uuid[]) returns uuid language sql security invoker set search_path='' as $$select rc3_demo.submit(p_channel,p_year,p_assignment_ids)$$;
create function rc3_demo.review(p_application_id uuid,p_approved boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rc3_demo.applications%rowtype;
begin
 if not (rc3_demo.roles()->>'admin')::boolean then raise exception 'Registry administrator required' using errcode='42501'; end if;
 if p_approved is null or (not p_approved and length(trim(coalesce(p_note,'')))<10) or length(coalesce(p_note,''))>300 then raise exception 'Review decision and a return reason are required'; end if;
 select * into strict a from rc3_demo.applications where id=p_application_id for update;
 if a.status not in ('submitted','returned') then raise exception 'Application is no longer awaiting document review'; end if;
 update rc3_demo.applications set status=case when p_approved then 'documents_approved' else 'returned' end,reviewed_by=actor,reviewed_at=now(),review_note=case when p_approved then 'Simulated roster and recommendation letter approved' else trim(p_note) end where id=a.id;
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,case when p_approved then 'documents_approved' else 'documents_returned' end,actor);
end $$;
create function public.rc3_demo_review(p_application_id uuid,p_approved boolean,p_note text) returns void language sql security invoker set search_path='' as $$select rc3_demo.review(p_application_id,p_approved,p_note)$$;
create function rc3_demo.authorize(p_application_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rc3_demo.applications%rowtype; n bigint;
begin
 if not (rc3_demo.roles()->>'finance')::boolean then raise exception 'COWL finance authorization required' using errcode='42501'; end if;
 select * into strict a from rc3_demo.applications where id=p_application_id for update;
 if a.status<>'documents_approved' or a.reviewed_by is null then raise exception 'Approved documents required'; end if;
 select count(*) into n from rc3_demo.application_members where application_id=a.id;
 if n<1 then raise exception 'Empty roster'; end if;
 update rc3_demo.applications set status='awaiting_payment',due_centavos=n*5000,authorized_by=actor,authorized_at=now() where id=a.id;
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,'obligation_authorized',actor);
end $$;
create function public.rc3_demo_authorize(p_application_id uuid) returns void language sql security invoker set search_path='' as $$select rc3_demo.authorize(p_application_id)$$;
create function rc3_demo.pay(p_application_id uuid,p_amount_centavos bigint,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rc3_demo.applications%rowtype; d date:=(now() at time zone 'Asia/Manila')::date; exp date; expected integer; updated integer;
begin
 if not (rc3_demo.roles()->>'finance')::boolean then raise exception 'COWL finance authorization required' using errcode='42501'; end if;
 select * into strict a from rc3_demo.applications where id=p_application_id for update;
 if a.status<>'awaiting_payment' or a.reviewed_by is null or a.authorized_by is null or a.due_centavos is null or p_amount_centavos is null or p_amount_centavos<>a.due_centavos or not coalesce(p_confirmed,false) then raise exception 'Exact approved balance and confirmation required'; end if;
 exp:=(d+interval '1 year')::date;
 -- Prevent older applications from overwriting later validation; this is a rehearsal-only roster.
 if exists(select 1 from rc3_demo.application_members m join rc3_demo.assignments s on s.id=m.assignment_id where m.application_id=a.id and s.renewal_date is not null and s.renewal_date>=d) then raise exception 'Assignment already validated on this date or later'; end if;
 select count(*) into expected from rc3_demo.application_members where application_id=a.id;
 insert into rc3_demo.payments(application_id,amount_centavos,recorded_by) values(a.id,p_amount_centavos,actor);
 update rc3_demo.assignments s set renewal_date=d,expiration_date=exp from rc3_demo.application_members m where m.application_id=a.id and s.id=m.assignment_id and (s.renewal_date is null or s.renewal_date<d);
 get diagnostics updated=row_count;
 if updated<>expected then raise exception 'Roster validation conflict'; end if;
 update rc3_demo.applications set paid_centavos=p_amount_centavos,status='renewed',renewed_at=now() where id=a.id;
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,'otc_payment_recorded',actor),(a.id,'synthetic_assignments_validated',actor);
end $$;
create function public.rc3_demo_pay(p_application_id uuid,p_amount_centavos bigint,p_confirmed boolean) returns void language sql security invoker set search_path='' as $$select rc3_demo.pay(p_application_id,p_amount_centavos,p_confirmed)$$;
revoke all on all functions in schema rc3_demo from public,anon,authenticated;
grant usage on schema rc3_demo to authenticated;
grant execute on function rc3_demo.roles(),rc3_demo.snapshot(),rc3_demo.submit(text,integer,uuid[]),rc3_demo.review(uuid,boolean,text),rc3_demo.authorize(uuid),rc3_demo.pay(uuid,bigint,boolean) to authenticated;
revoke all on function public.rc3_demo_access(),public.rc3_demo_snapshot(),public.rc3_demo_submit(text,integer,uuid[]),public.rc3_demo_review(uuid,boolean,text),public.rc3_demo_authorize(uuid),public.rc3_demo_pay(uuid,bigint,boolean) from public,anon;
grant execute on function public.rc3_demo_access(),public.rc3_demo_snapshot(),public.rc3_demo_submit(text,integer,uuid[]),public.rc3_demo_review(uuid,boolean,text),public.rc3_demo_authorize(uuid),public.rc3_demo_pay(uuid,bigint,boolean) to authenticated;
