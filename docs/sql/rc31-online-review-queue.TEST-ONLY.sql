-- TEST only. Staff-authenticated operator rehearses a parish submission; mock OTP is not authorization.
set local lock_timeout='3s';
alter table rc3_demo.applications add column preferred_payment_method text check(preferred_payment_method in ('OTC','QR')), add column sample_document_received date, add column sample_document_retain_until date;
create function rc3_demo.online_submit(p_parish text,p_year integer,p_assignment_ids uuid[],p_method text,p_sample_letter boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid; d date:=(now() at time zone 'Asia/Manila')::date; ref text;
begin
 if auth.uid() is null or not (rc3_demo.roles()->>'admin')::boolean then raise exception 'Authorized TEST Registry operator required' using errcode='42501'; end if;
 if p_parish is null or p_parish not in ('Sample Parish A','Sample Parish B') or p_method is null or p_method not in ('OTC','QR') or not coalesce(p_sample_letter,false) then raise exception 'Sample parish, payment preference and generated recommendation required';end if;
 if exists(select 1 from rc3_demo.assignments where id=any(p_assignment_ids) and parish<>p_parish) then raise exception 'Roster does not match the selected sample parish';end if;
 b:=rc3_demo.submit('online_rehearsal',p_year,p_assignment_ids);
 update rc3_demo.applications set preferred_payment_method=p_method,sample_document_received=d,sample_document_retain_until=(d+interval '12 months')::date where id=b returning reference into ref;
 insert into rc3_demo.events(application_id,action,actor_id) values(b,'online_sample_letter_attached',auth.uid());
 return jsonb_build_object('id',b,'reference',ref);
end $$;
create function rc3_demo.online_resubmit(p_application_id uuid,p_parish text,p_sample_letter boolean) returns void language plpgsql security definer set search_path='' as $$
declare a rc3_demo.applications%rowtype;d date:=(now() at time zone 'Asia/Manila')::date;
begin
 if auth.uid() is null or not (rc3_demo.roles()->>'admin')::boolean then raise exception 'Authorized TEST Registry operator required' using errcode='42501';end if;
 select * into strict a from rc3_demo.applications where id=p_application_id for update;
 if p_parish is null or p_parish not in ('Sample Parish A','Sample Parish B') or a.parish<>p_parish or a.channel<>'online_rehearsal' or a.status<>'returned' or not coalesce(p_sample_letter,false) then raise exception 'Returned application for this sample parish and corrected sample letter required';end if;
 update rc3_demo.applications set status='submitted',reviewed_by=null,reviewed_at=null,sample_document_received=d,sample_document_retain_until=(d+interval '12 months')::date where id=a.id;
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,'online_correction_resubmitted',auth.uid());
end $$;
create function public.rc3_demo_online_submit(p_parish text,p_year integer,p_assignment_ids uuid[],p_method text,p_sample_letter boolean) returns jsonb language sql security invoker set search_path='' as $$select rc3_demo.online_submit(p_parish,p_year,p_assignment_ids,p_method,p_sample_letter)$$;
create function public.rc3_demo_online_resubmit(p_application_id uuid,p_parish text,p_sample_letter boolean) returns void language sql security invoker set search_path='' as $$select rc3_demo.online_resubmit(p_application_id,p_parish,p_sample_letter)$$;
revoke all on function rc3_demo.online_submit(text,integer,uuid[],text,boolean),rc3_demo.online_resubmit(uuid,text,boolean),public.rc3_demo_online_submit(text,integer,uuid[],text,boolean),public.rc3_demo_online_resubmit(uuid,text,boolean) from public,anon,authenticated;
grant execute on function rc3_demo.online_submit(text,integer,uuid[],text,boolean),rc3_demo.online_resubmit(uuid,text,boolean),public.rc3_demo_online_submit(text,integer,uuid[],text,boolean),public.rc3_demo_online_resubmit(uuid,text,boolean) to authenticated;
create or replace function rc3_demo.review(p_application_id uuid,p_approved boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rc3_demo.applications%rowtype;
begin
 if not (rc3_demo.roles()->>'admin')::boolean then raise exception 'Registry administrator required' using errcode='42501'; end if;
 if p_approved is null or (not p_approved and length(trim(coalesce(p_note,'')))<10) or length(coalesce(p_note,''))>300 then raise exception 'Review decision and a return reason are required'; end if;
 select * into strict a from rc3_demo.applications where id=p_application_id for update;
 if a.status not in ('submitted','returned') then raise exception 'Application is no longer awaiting document review'; end if;
 if a.channel='online_rehearsal' and a.status='returned' then raise exception 'Wait for the parish to resubmit its correction';end if;
 update rc3_demo.applications set status=case when p_approved then 'documents_approved' else 'returned' end,reviewed_by=actor,reviewed_at=now(),review_note=case when p_approved then 'Simulated roster and recommendation letter approved' else trim(p_note) end where id=a.id;
 insert into rc3_demo.events(application_id,action,actor_id) values(a.id,case when p_approved then 'documents_approved' else 'documents_returned' end,actor);
end $$;
