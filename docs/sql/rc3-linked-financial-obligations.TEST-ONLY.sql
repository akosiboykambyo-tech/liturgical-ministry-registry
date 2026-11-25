-- TEST ONLY. Additive bridge: never run against production. No member or encryption table access.
set lock_timeout='3s';
create table rc3_demo.financial_links(
 application_id uuid primary key references rc3_demo.applications(id),
 payment_request_id uuid not null unique references public.fs_payment_requests(id),
 linked_at timestamptz not null default now()
);
alter table rc3_demo.financial_links enable row level security;
revoke all on rc3_demo.financial_links from public,anon,authenticated;
create or replace function rc3_demo.authorize(p_application_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rc3_demo.applications%rowtype; n integer; parish_id_v uuid; ministry_id_v uuid; fee uuid; batch uuid; req uuid; parent uuid; ref text;
begin
 if not (rc3_demo.roles()->>'finance')::boolean then raise exception 'COWL finance authorization required' using errcode='42501'; end if;
 select * into strict a from rc3_demo.applications where id=p_application_id for update;
 if a.status<>'documents_approved' or a.reviewed_by is null or a.reference not like 'RN-DEMO-%' then raise exception 'Approved demo documents required'; end if;
 select count(*) into n from rc3_demo.application_members where application_id=a.id;
 if n<1 then raise exception 'Empty roster'; end if;
 -- Serialize quote creation in the fictional scope; retain supplemental batches.
 perform pg_advisory_xact_lock(hashtextextended('rc3-demo-fees-and-batches',0));
 insert into public.fs_parishes(canonical_name) values('RC3 DEMO - '||a.parish) on conflict(canonical_name) do nothing;
 select id into strict parish_id_v from public.fs_parishes where canonical_name='RC3 DEMO - '||a.parish and active;
 insert into public.fs_ministries(canonical_name) values('RC3 DEMO - '||a.ministry) on conflict(canonical_name) do nothing;
 select id into strict ministry_id_v from public.fs_ministries where canonical_name='RC3 DEMO - '||a.ministry and active;
 insert into public.fs_fee_schedules(ministry_id,service_year,version,rate_centavos,status,approved_by,approved_at)
 values(ministry_id_v,a.service_year,1,5000,'approved',actor,now()) on conflict(ministry_id,service_year,version) do nothing;
 select id into strict fee from public.fs_fee_schedules where ministry_id=ministry_id_v and service_year=a.service_year and version=1 and rate_centavos=5000 and status='approved';
 select id into parent from public.fs_renewal_batches where parish_id=parish_id_v and ministry_id=ministry_id_v and service_year=a.service_year and kind='original';
 ref:='RC3-DEMO-'||a.reference;
 insert into public.fs_renewal_batches(renewal_reference,parish_id,ministry_id,service_year,kind,parent_batch_id,origin,submitted_by,status,reviewed_by,reviewed_at)
 values(ref,parish_id_v,ministry_id_v,a.service_year,case when parent is null then 'original' else 'supplemental' end,parent,'staff',a.submitted_by,'approved',a.reviewed_by,a.reviewed_at) returning id into batch;
 insert into public.fs_payment_requests(payment_reference,batch_id,quote_version,fee_schedule_id,quoted_participants,total_due_centavos,status,issued_by)
 values(ref||'-PAY',batch,1,fee,n,n::bigint*5000,'quoted',actor) returning id into req;
 insert into rc3_demo.financial_links(application_id,payment_request_id) values(a.id,req);
 update rc3_demo.applications set status='awaiting_payment',due_centavos=n::bigint*5000,authorized_by=actor,authorized_at=now() where id=a.id;
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,'linked_obligation_authorized',actor);
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata) values('payment_request',req,'rc3_demo_obligation_authorized',actor,jsonb_build_object('application_reference',a.reference));
end $$;
create function rc3_demo.sync_settlement(p_request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rc3_demo.applications%rowtype; req public.fs_payment_requests%rowtype; paid bigint; d date:=(now() at time zone 'Asia/Manila')::date; expected integer; updated integer;
begin
 if not (rc3_demo.roles()->>'finance')::boolean then raise exception 'COWL finance authorization required' using errcode='42501'; end if;
 select * into strict req from public.fs_payment_requests where id=p_request_id for update;
 select x.* into strict a from rc3_demo.applications x join rc3_demo.financial_links l on l.application_id=x.id where l.payment_request_id=req.id for update of x;
 if a.reviewed_by is null or a.authorized_by is null or a.due_centavos is null or req.total_due_centavos<>a.due_centavos or req.payment_reference not like 'RC3-DEMO-%' then raise exception 'Linked obligation integrity check failed'; end if;
 select coalesce(sum(amount_centavos),0)::bigint into paid from public.fs_collections where payment_request_id=req.id and status='posted';
 if paid>a.due_centavos then raise exception 'Overpayment must be investigated'; end if;
 if a.status='renewed' then
   if paid<>a.due_centavos then raise exception 'Settled payment changed; manual exception review required'; end if;
   return;
 end if;
 if a.status<>'awaiting_payment' then raise exception 'Application not awaiting payment'; end if;
 if paid<a.due_centavos then
  if paid<>a.paid_centavos then
   update rc3_demo.applications set paid_centavos=paid where id=a.id;
   insert into rc3_demo.events(application_id,action,actor_id) values(a.id,'partial_settlement_recorded',actor);
  end if;
  return;
 end if;
 if req.status<>'paid' then raise exception 'Payment request has not reached paid status'; end if;
 select count(*) into expected from rc3_demo.application_members where application_id=a.id;
 update rc3_demo.assignments s set renewal_date=d,expiration_date=(d+interval '1 year')::date from rc3_demo.application_members m where m.application_id=a.id and s.id=m.assignment_id and (s.renewal_date is null or s.renewal_date<d);
 get diagnostics updated=row_count;
 if expected<1 or updated<>expected then raise exception 'Roster validation conflict; no new collection committed'; end if;
 insert into rc3_demo.payments(application_id,amount_centavos,recorded_by) values(a.id,paid,actor);
 update rc3_demo.applications set paid_centavos=paid,status='renewed',renewed_at=now() where id=a.id;
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,'verified_ledger_settlement',actor),(a.id,'synthetic_assignments_validated',actor);
end $$;
create function rc3_demo.post_otc(p_payment_request_id uuid,p_amount_centavos bigint,p_counted_at timestamptz,p_cash_physically_counted boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if not (rc3_demo.roles()->>'finance')::boolean then raise exception 'COWL finance authorization required' using errcode='42501'; end if;
 if not exists(select 1 from rc3_demo.financial_links where payment_request_id=p_payment_request_id) then raise exception 'Not an RC3 linked obligation'; end if;
 c:=public.fs_record_otc_payment(p_payment_request_id,p_amount_centavos,p_counted_at,p_cash_physically_counted);
 perform rc3_demo.sync_settlement(p_payment_request_id); return c;
end $$;
create function rc3_demo.post_qr(p_claim_id uuid,p_bank_credit_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid; req uuid;
begin
 if not (rc3_demo.roles()->>'finance')::boolean then raise exception 'COWL finance authorization required' using errcode='42501'; end if;
 select payment_request_id into strict req from public.fs_payment_claims where id=p_claim_id;
 if not exists(select 1 from rc3_demo.financial_links where payment_request_id=req) then raise exception 'Not an RC3 linked obligation'; end if;
 c:=public.fs_verify_qr_payment(p_claim_id,p_bank_credit_id);
 perform rc3_demo.sync_settlement(req); return c;
end $$;
-- Legacy RC3 preview no longer creates an independent payment record.
create or replace function rc3_demo.pay(p_application_id uuid,p_amount_centavos bigint,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare req uuid;
begin
 if not (rc3_demo.roles()->>'finance')::boolean then raise exception 'COWL finance authorization required' using errcode='42501'; end if;
 select payment_request_id into strict req from rc3_demo.financial_links where application_id=p_application_id;
 perform rc3_demo.post_otc(req,p_amount_centavos,now(),p_confirmed);
end $$;
create function rc3_demo.prepare_qr(p_application_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rc3_demo.applications%rowtype; req public.fs_payment_requests%rowtype; account uuid; doc uuid; claim uuid; ref text; paid bigint;
begin
 if not (rc3_demo.roles()->>'admin')::boolean then raise exception 'Registry administrator required' using errcode='42501'; end if;
 select p.* into strict req from public.fs_payment_requests p join rc3_demo.financial_links l on l.payment_request_id=p.id where l.application_id=p_application_id for update of p;
 select * into strict a from rc3_demo.applications where id=p_application_id for update;
 if a.status<>'awaiting_payment' or a.reviewed_by is null or a.authorized_by is null or a.authorized_by=actor or req.payment_reference not like 'RC3-DEMO-%' or req.status not in ('quoted','awaiting_payment','part_paid') then raise exception 'Separate Registry and finance actors and a payable obligation required'; end if;
 if exists(select 1 from public.fs_payment_claims where payment_request_id=req.id) then raise exception 'A synthetic QR claim already exists'; end if;
 select coalesce(sum(amount_centavos),0)::bigint into paid from public.fs_collections where payment_request_id=req.id and status='posted';
 if paid>=req.total_due_centavos then raise exception 'No outstanding balance'; end if;
 ref:=req.payment_reference||'-QR';
 insert into public.fs_receiving_accounts(internal_name,beneficiary_name,institution_name,provider_name,account_fingerprint,purpose,status,authorized_by,authorized_at)
 values(ref,'DEMONSTRATION ONLY','Fictional bank — no account','DEMO BANK',ref||'-NONPAYABLE','cowl_collections','approved',actor,now()) returning id into account;
 insert into public.fs_submission_documents(batch_id,document_kind,storage_path,original_name,uploaded_by,scan_status)
 values(req.batch_id,'payment_evidence','demo-metadata-only/'||ref,'DEMONSTRATION ONLY — synthetic evidence metadata',actor,'clean') returning id into doc;
 insert into public.fs_payment_claims(payment_request_id,receiving_account_id,provider_name,submitted_external_reference,claimed_amount_centavos,claimed_paid_at,proof_document_id,submitted_by)
 values(req.id,account,'DEMO BANK',ref,req.total_due_centavos-paid,now(),doc,actor) returning id into claim;
 insert into public.fs_bank_credits(receiving_account_id,provider_name,bank_external_reference,amount_centavos,credited_at,statement_batch_reference,recorded_by,verified_at)
 values(account,'DEMO BANK',ref,req.total_due_centavos-paid,now(),'RC3 DEMO SYNTHETIC MATCH',actor,now()),(account,'DEMO BANK',ref||'-MISMATCH',req.total_due_centavos-paid+100,now(),'RC3 DEMO SYNTHETIC MISMATCH',actor,now());
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,'synthetic_qr_evidence_prepared',actor);
end $$;
create function public.rc3_demo_post_otc(p_payment_request_id uuid,p_amount_centavos bigint,p_counted_at timestamptz,p_cash_physically_counted boolean) returns uuid language sql security invoker set search_path='' as $$select rc3_demo.post_otc(p_payment_request_id,p_amount_centavos,p_counted_at,p_cash_physically_counted)$$;
create function public.rc3_demo_post_qr(p_claim_id uuid,p_bank_credit_id uuid) returns uuid language sql security invoker set search_path='' as $$select rc3_demo.post_qr(p_claim_id,p_bank_credit_id)$$;
create function public.rc3_demo_sync_settlement(p_request_id uuid) returns void language sql security invoker set search_path='' as $$select rc3_demo.sync_settlement(p_request_id)$$;
create function public.rc3_demo_prepare_qr(p_application_id uuid) returns void language sql security invoker set search_path='' as $$select rc3_demo.prepare_qr(p_application_id)$$;
revoke all on function rc3_demo.sync_settlement(uuid),rc3_demo.post_otc(uuid,bigint,timestamptz,boolean),rc3_demo.post_qr(uuid,uuid),rc3_demo.prepare_qr(uuid),public.rc3_demo_post_otc(uuid,bigint,timestamptz,boolean),public.rc3_demo_post_qr(uuid,uuid),public.rc3_demo_sync_settlement(uuid),public.rc3_demo_prepare_qr(uuid) from public,anon,authenticated;
grant execute on function rc3_demo.sync_settlement(uuid),rc3_demo.post_otc(uuid,bigint,timestamptz,boolean),rc3_demo.post_qr(uuid,uuid),rc3_demo.prepare_qr(uuid),public.rc3_demo_post_otc(uuid,bigint,timestamptz,boolean),public.rc3_demo_post_qr(uuid,uuid),public.rc3_demo_sync_settlement(uuid),public.rc3_demo_prepare_qr(uuid) to authenticated;
create or replace function rc3_demo.snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare roles jsonb:=rc3_demo.roles(); admin boolean:=(roles->>'admin')::boolean; finance boolean:=(roles->>'finance')::boolean;
begin
 if not (admin or finance) then raise exception 'Authorized TEST role required' using errcode='42501'; end if;
 return jsonb_build_object('roles',roles,'assignments',case when admin then coalesce((select jsonb_agg(to_jsonb(a) order by a.parish,a.ministry,a.minister_label) from rc3_demo.assignments a),'[]'::jsonb) else '[]'::jsonb end,
 'applications',coalesce((select jsonb_agg(to_jsonb(a)-'submitted_by'-'reviewed_by'-'authorized_by'||jsonb_build_object('members',(select count(*) from rc3_demo.application_members m where m.application_id=a.id),'payment_request_id',l.payment_request_id,'payment_reference',p.payment_reference,'qr_prepared',exists(select 1 from public.fs_payment_claims pc where pc.payment_request_id=p.id),'roster',case when admin then (select coalesce(jsonb_agg(s.minister_label order by s.minister_label),'[]'::jsonb) from rc3_demo.application_members m join rc3_demo.assignments s on s.id=m.assignment_id where m.application_id=a.id) else '[]'::jsonb end) order by a.submitted_at desc) from rc3_demo.applications a left join rc3_demo.financial_links l on l.application_id=a.id left join public.fs_payment_requests p on p.id=l.payment_request_id where admin or (finance and a.status in ('documents_approved','awaiting_payment','renewed'))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)-'actor_id' order by e.id desc) from (select ev.* from rc3_demo.events ev join rc3_demo.applications a on a.id=ev.application_id where admin or (finance and a.status in ('documents_approved','awaiting_payment','renewed')) order by ev.id desc limit 100) e),'[]'::jsonb));
end $$;
