-- Run inside a rollback transaction with isolated TEST fixtures only.
select set_config('rc32.qa.admin',(select user_id::text from registry_private.registration_administrators where active and revoked_at is null order by user_id limit 1),true);
select set_config('rc32.qa.finance',(select user_id::text from public.fs_staff_grants where role_code='cowl_finance_verifier' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) limit 1),true);
set local role authenticated;
do $$ declare s jsonb; snap jsonb; payload jsonb; b uuid; a uuid; req uuid; x jsonb; l jsonb; rev int; rejected uuid; c uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc32.qa.admin'),true);
 s:=public.rc32_demo_open_draft('RC32 Sample Parish A',2031,'online_rehearsal');b:=(s->>'id')::uuid;rev:=(s->>'revision')::int;
 snap:=public.rc32_demo_snapshot('RC32 Sample Parish A');
 select jsonb_agg(jsonb_build_object('ministry',m,'confirmed',true,'items',items,'requests','[]'::jsonb,'letter',jsonb_build_object('name','sample.pdf','confirmed',true),'zeroDeclaration',false) order by m) into payload from (select x->>'ministry' m,jsonb_agg(jsonb_build_object('id',x->>'id','decision',case when x->>'first'='Maria' then 'renew' else 'no' end)) items from jsonb_array_elements(snap->'roster') x group by x->>'ministry') z;
 begin perform public.rc3_demo_submit('walk_in',2031,array[(snap->'roster'->0->>'id')::uuid]);raise exception 'LEGACY_BYPASS';exception when check_violation then null;end;
 s:=public.rc32_demo_save_draft(b,rev,payload);rev:=(s->>'revision')::int;
 begin perform public.rc32_demo_save_draft(b,rev-1,payload);raise exception 'STALE_ACCEPTED';exception when serialization_failure then null;end;
 s:=public.rc32_demo_submit(b,rev,'OTC');rev:=(s->>'revision')::int;
 begin perform public.rc32_demo_finalize(b,rev);raise exception 'PREMATURE_FINALIZE';exception when others then if sqlerrm='PREMATURE_FINALIZE' then raise;end if;end;
 perform public.rc32_demo_return_ministry(b,'Ministry of Altar Servers',rev,'Correct sample recommendation letter.');
 s:=public.rc32_demo_open_draft('RC32 Sample Parish A',2031,'online_rehearsal');rev:=(s->>'revision')::int;
 s:=public.rc32_demo_save_draft(b,rev,payload);rev:=(s->>'revision')::int;s:=public.rc32_demo_submit(b,rev,'OTC');rev:=(s->>'revision')::int;
 select x into s from jsonb_array_elements(public.rc32_demo_snapshot('RC32 Sample Parish A')->'submissions') x where x->>'id'=b::text;
 for l in select x from jsonb_array_elements(s->'letters') x loop perform public.rc32_demo_review_letter(b,l->>'ministry',rev);end loop;
 for x in select t from jsonb_array_elements(s->'items') t where t->>'decision'='pending' loop
  if rejected is null then rejected:=(x->>'assignment_id')::uuid;perform public.rc32_demo_review_item(b,(x->>'id')::uuid,rev,'rejected','Fictional rejection');else perform public.rc32_demo_review_item(b,(x->>'id')::uuid,rev,'approved','');end if;
 end loop;
 a:=public.rc32_demo_finalize(b,rev);if a is null then raise exception 'Missing aggregate';end if;
 perform set_config('request.jwt.claim.sub',current_setting('rc32.qa.finance'),true);
 if (public.rc32_demo_snapshot(null)->'roster')<>'[]'::jsonb then raise exception 'Finance roster leak';end if;
 begin perform public.rc32_demo_open_draft('RC32 Sample Parish B',2031,'walk_in');raise exception 'FINANCE_WRITE_ACCEPTED';exception when insufficient_privilege then null;end;
 perform public.rc3_demo_authorize(a);
 select (x->>'payment_request_id')::uuid into req from jsonb_array_elements(public.rc3_demo_snapshot()->'applications') x where x->>'id'=a::text;
 begin perform public.fs_record_otc_payment(req,5000,now(),true);raise exception 'PARTIAL_ACCEPTED';exception when check_violation then if sqlerrm not like 'RC3 renewal requires full payment%' then raise;end if;end;
 c:=public.rc3_demo_post_otc(req,25000,now(),true);
 if not exists(select 1 from jsonb_array_elements(public.rc3_demo_snapshot()->'applications') x where x->>'id'=a::text and x->>'status'='renewed' and (x->>'paid_centavos')::bigint=25000) then raise exception 'Consolidated settlement failed';end if;
 perform set_config('request.jwt.claim.sub',current_setting('rc32.qa.admin'),true);
 if exists(select 1 from jsonb_array_elements(public.rc32_demo_snapshot('RC32 Sample Parish A')->'roster') x where x->>'id'=rejected::text and x->>'renewal_date' is not null) then raise exception 'Rejected assignment renewed';end if;
 if (select count(*) from jsonb_array_elements(public.rc32_demo_snapshot('RC32 Sample Parish A')->'roster') x where x->>'renewal_date' is not null)<>5 then raise exception 'Wrong validated count';end if;
end $$;
