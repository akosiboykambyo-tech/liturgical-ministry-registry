-- Rollback-only QA: in-progress walk-in takeover and exact no-duplicate reservation.
select set_config('rc33.qa.admin',(select user_id::text from registry_private.registration_administrators where active and revoked_at is null order by user_id limit 1),true);
set local role authenticated;
do $$
declare c uuid;d jsonb;w jsonb;m text:='Ministry of Lectors and Commentators';p jsonb;bid uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.admin'),true);
 c:=public.rc33_demo_open_cycle('RC33 Sample Parish A',2027);
 d:=public.rc33_demo_open_draft(c,m,'original','online_rehearsal');
 begin perform public.rc33_demo_open_draft(c,m,'original','walk_in');raise exception 'UNCONFIRMED_TAKEOVER';exception when others then if sqlerrm='UNCONFIRMED_TAKEOVER' then raise;end if;end;
 w:=public.rc33_demo_open_draft(c,m,'original','walk_in',null,true);
 if w->>'id'=d->>'id' or w->>'channel'<>'walk_in' then raise exception 'TAKEOVER_FAILED';end if;
 begin perform public.rc33_demo_save_draft((d->>'id')::uuid,(d->>'revision')::integer,d->'payload');raise exception 'OLD_DRAFT_SAVED';exception when serialization_failure then null;end;
 begin perform public.rc33_demo_open_draft(c,m,'original','online_rehearsal');raise exception 'ONLINE_OVERWROTE_STAFF';exception when others then if sqlerrm='ONLINE_OVERWROTE_STAFF' then raise;end if;end;
 p:=w->'payload'||jsonb_build_object('method','OTC','letter','sample.pdf','confirmed',true,'zero',false);
 w:=public.rc33_demo_save_draft((w->>'id')::uuid,(w->>'revision')::integer,p);
 bid:=public.rc33_demo_submit_draft((w->>'id')::uuid,(w->>'revision')::integer);
 if not exists(select 1 from jsonb_array_elements(public.rc33_demo_cycle_detail('RC33 Sample Parish A',2027)->'batches') x where x->>'id'=bid::text and x->>'channel'='walk_in') then raise exception 'WALK_IN_NOT_SHARED';end if;
end $$;
