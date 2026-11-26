-- Rollback-only, after campaign migration. Tests old year and closed-campaign paths.
select set_config('rc34.qa.admin',(select user_id::text from registry_private.registration_administrators where active and revoked_at is null order by user_id limit 1),true);
select set_config('rc34.qa.finance',(select user_id::text from public.fs_staff_grants where role_code='cowl_finance_verifier' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) limit 1),true);
-- Pre-existing inactive-year fixtures; only privileged QA changes campaign temporarily.
update rc33_demo.renewal_campaign set service_year=2028 where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('rc34.qa.admin'),true);
select set_config('rc34.qa.future_cycle',public.rc33_demo_open_cycle('RC33 Sample Parish A',2028)::text,true);
select set_config('rc34.qa.future_draft',public.rc33_demo_open_draft(current_setting('rc34.qa.future_cycle')::uuid,'Ministry of Lectors and Commentators','original','online_rehearsal')::text,true);
select set_config('rc34.qa.future_draft',public.rc33_demo_save_draft((current_setting('rc34.qa.future_draft')::jsonb->>'id')::uuid,(current_setting('rc34.qa.future_draft')::jsonb->>'revision')::integer,(current_setting('rc34.qa.future_draft')::jsonb->'payload')||jsonb_build_object('confirmed',true,'letter','sample.pdf','method','OTC','zero',false))::text,true);
reset role;
update rc33_demo.renewal_campaign set service_year=2027 where singleton;
set local role authenticated;
do $$
declare c uuid;future uuid:=current_setting('rc34.qa.future_cycle')::uuid;d jsonb:=current_setting('rc34.qa.future_draft')::jsonb;nowdraft jsonb;b uuid;mid text:='Ministry of Lectors and Commentators';mas text:='Ministry of Altar Servers';
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc34.qa.admin'),true);
 if public.rc34_demo_campaign_status()<>jsonb_build_object('service_year',2027,'intake_open',true) then raise exception 'BAD_CAMPAIGN';end if;
 begin perform public.rc33_demo_open_cycle('RC33 Sample Parish B',2028);raise exception 'FUTURE_OPEN';exception when check_violation then null;end;
 begin perform public.rc33_demo_open_cycle('RC33 Sample Parish B',2026);raise exception 'PAST_OPEN';exception when check_violation then null;end;
 if public.rc33_demo_open_cycle('RC33 Sample Parish A',2028)<>future then raise exception 'HISTORY_NOT_READABLE';end if;
 begin perform public.rc33_demo_open_draft(future,mas,'original','online_rehearsal');raise exception 'FUTURE_DRAFT';exception when check_violation then null;end;
 begin perform public.rc33_demo_open_draft(future,mid,'original','online_rehearsal');raise exception 'FUTURE_RESUME';exception when check_violation then null;end;
 begin perform public.rc33_demo_open_draft(future,mas,'original','walk_in');raise exception 'CHANNEL_BYPASS';exception when check_violation then null;end;
 begin perform public.rc33_demo_save_draft((d->>'id')::uuid,(d->>'revision')::int,d->'payload');raise exception 'FUTURE_SAVE';exception when check_violation then null;end;
 begin perform public.rc33_demo_submit_batch(future,mas,'original','walk_in','OTC','[]'::jsonb,null,true,true);raise exception 'DIRECT_SUBMIT_BYPASS';exception when check_violation then null;end;
 begin perform public.rc33_demo_submit_draft((d->>'id')::uuid,(d->>'revision')::int);raise exception 'FUTURE_SUBMIT';exception when check_violation then null;end;
 c:=public.rc33_demo_open_cycle('RC33 Sample Parish A',2027);
 nowdraft:=public.rc33_demo_open_draft(c,mid,'original','online_rehearsal');
 nowdraft:=public.rc33_demo_save_draft((nowdraft->>'id')::uuid,(nowdraft->>'revision')::int,(nowdraft->'payload')||jsonb_build_object('confirmed',true,'letter','sample.pdf','method','OTC','zero',false));
 b:=public.rc33_demo_submit_draft((nowdraft->>'id')::uuid,(nowdraft->>'revision')::int);
 perform set_config('rc34.qa.batch',b::text,true);
 perform set_config('rc34.qa.active_cycle',c::text,true);
 perform set_config('request.jwt.claim.sub',current_setting('rc34.qa.finance'),true);
 begin perform public.rc33_demo_record_advance('RC33 Sample Parish B',2028,mid,1,5000,true);raise exception 'FUTURE_ADVANCE';exception when check_violation then null;end;
end $$;
reset role;
update rc33_demo.renewal_campaign set intake_open=false where singleton;
set local role authenticated;
do $$
declare c uuid:=current_setting('rc34.qa.active_cycle')::uuid;b uuid:=current_setting('rc34.qa.batch')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc34.qa.admin'),true);
 begin perform public.rc33_demo_open_draft(c,'Ministry of Altar Servers','original','online_rehearsal');raise exception 'CLOSED_CAMPAIGN_DRAFT';exception when check_violation then null;end;
 -- Closure does not block review of an already submitted application.
 perform public.rc33_demo_review_letter(b,1);
end $$;
reset role;
