-- Rollback only. One incomplete batch must roll back the entire combined submission.
select set_config('rc33.qa.admin',(select user_id::text from registry_private.registration_administrators where active and revoked_at is null order by user_id limit 1),true);
set local role authenticated;
do $$
declare c uuid;d jsonb;e jsonb;req jsonb;r jsonb;invalid jsonb;
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.admin'),true);
 c:=public.rc33_demo_open_cycle('RC33 Sample Parish A',2027);
 d:=public.rc33_demo_open_draft(c,'Mother Butler Guild','original','online_rehearsal');
 e:=public.rc33_demo_open_draft(c,'Ministry of Altar Servers','original','online_rehearsal');
 d:=public.rc33_demo_save_draft((d->>'id')::uuid,(d->>'revision')::int,(d->'payload')||jsonb_build_object('confirmed',true,'roster_confirmed',true,'letter_confirmed',true,'letter','sample.pdf','method','OTC','zero',false));
 e:=public.rc33_demo_save_draft((e->>'id')::uuid,(e->>'revision')::int,(e->'payload')||jsonb_build_object('confirmed',true,'roster_confirmed',true,'letter_confirmed',true,'letter','invalid.txt','method','QR','zero',false));
 req:=jsonb_build_array(jsonb_build_object('id',d->>'id','revision',d->>'revision'),jsonb_build_object('id',e->>'id','revision',e->>'revision'));
 begin perform public.rc33_demo_submit_parish_drafts(c,req);raise exception 'INVALID_GROUP_ACCEPTED';exception when others then if sqlerrm='INVALID_GROUP_ACCEPTED' then raise;end if;end;
 if jsonb_array_length(public.rc33_demo_cycle_detail('RC33 Sample Parish A',2027)->'batches')<>0 then raise exception 'PARTIAL_SUBMISSION';end if;
 e:=public.rc33_demo_save_draft((e->>'id')::uuid,(e->>'revision')::int,(e->'payload')||jsonb_build_object('letter','sample.pdf'));
 req:=jsonb_build_array(jsonb_build_object('id',d->>'id','revision',d->>'revision'),jsonb_build_object('id',e->>'id','revision',e->>'revision'));
 r:=public.rc33_demo_submit_parish_drafts(c,req);
 if jsonb_array_length(r)<>2 or public.rc33_demo_submit_parish_drafts(c,req)<>r then raise exception 'GROUP_RETRY_FAILED';end if;
 if (select count(*) from jsonb_array_elements(public.rc33_demo_cycle_detail('RC33 Sample Parish A',2027)->'batches') x where x->>'status'='submitted' and x->>'aggregate_id' is null)<>2 then raise exception 'INDEPENDENT_BATCHES_NOT_PRESERVED';end if;
end $$;
reset role;
