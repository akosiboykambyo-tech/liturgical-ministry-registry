-- Rollback-only: coordinator (anon) -> Registry -> COWL exact OTC settlement, with cross-parish denial.
select set_config('rc34.qa.admin',(select user_id::text from registry_private.registration_administrators where active and revoked_at is null order by user_id limit 1),true);
select set_config('rc34.qa.finance',(select user_id::text from public.fs_staff_grants where role_code='cowl_finance_verifier' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) limit 1),true);
set local role anon;
do $$
declare a jsonb;b jsonb;t text;u text;c uuid;other uuid;d jsonb;e jsonb;r jsonb;req jsonb;batch uuid;
begin
 begin perform public.rc34_demo_parish_login('09000000021','000000');raise exception 'BAD_CODE_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.rc34_demo_parish_login('09000000032','246810');raise exception 'INACTIVE_ACCEPTED';exception when insufficient_privilege then null;end;
 a:=public.rc34_demo_parish_login('09000000021','246810');b:=public.rc34_demo_parish_login('09000000031','246810');t:=a->>'token';u:=b->>'token';
 c:=(public.rc34_demo_parish_call(t,'open_cycle','{}')#>>'{}')::uuid;other:=(public.rc34_demo_parish_call(u,'open_cycle','{}')#>>'{}')::uuid;
 begin perform public.rc34_demo_parish_call(t,'snapshot',jsonb_build_object('p_parish','RC33 Sample Parish B'));raise exception 'CROSS_PARISH_READ';exception when insufficient_privilege then null;end;
 begin perform public.rc34_demo_parish_call(t,'open_draft',jsonb_build_object('p_cycle',other,'p_ministry','Mother Butler Guild','p_kind','original','p_channel','online_rehearsal'));raise exception 'CROSS_PARISH_DRAFT';exception when insufficient_privilege then null;end;
 begin perform public.rc34_demo_parish_call(t,'open_draft',jsonb_build_object('p_cycle',c,'p_ministry','Mother Butler Guild','p_kind','original','p_channel','walk_in'));raise exception 'WALKIN_BYPASS';exception when insufficient_privilege then null;end;
 d:=public.rc34_demo_parish_call(t,'open_draft',jsonb_build_object('p_cycle',c,'p_ministry','Mother Butler Guild','p_kind','original','p_channel','online_rehearsal'));
 e:=public.rc34_demo_parish_call(t,'open_draft',jsonb_build_object('p_cycle',c,'p_ministry','Ministry of Altar Servers','p_kind','original','p_channel','online_rehearsal'));
 begin perform public.rc34_demo_parish_call(u,'save_draft',jsonb_build_object('p_id',d->>'id','p_revision',1,'p_payload',d->'payload'));raise exception 'CROSS_PARISH_SAVE';exception when insufficient_privilege then null;end;
 d:=public.rc34_demo_parish_call(t,'save_draft',jsonb_build_object('p_id',d->>'id','p_revision',d->>'revision','p_payload',(d->'payload')||jsonb_build_object('confirmed',true,'roster_confirmed',true,'letter_confirmed',true,'letter','sample.pdf','method','OTC','zero',false)));
 e:=public.rc34_demo_parish_call(t,'save_draft',jsonb_build_object('p_id',e->>'id','p_revision',e->>'revision','p_payload',(e->'payload')||jsonb_build_object('confirmed',true,'roster_confirmed',true,'letter_confirmed',true,'letter','sample.pdf','method','QR','zero',false)));
 req:=jsonb_build_object('p_cycle',c,'p_drafts',jsonb_build_array(jsonb_build_object('id',d->>'id','revision',d->>'revision'),jsonb_build_object('id',e->>'id','revision',e->>'revision')));
 r:=public.rc34_demo_parish_call(t,'submit_parish',req);
 if jsonb_array_length(r)<>2 or public.rc34_demo_parish_call(t,'submit_parish',req)<>r then raise exception 'ATOMIC_RETRY_FAILED';end if;
 if jsonb_array_length(public.rc34_demo_parish_call(u,'snapshot','{}')->'batches')<>0 then raise exception 'OTHER_PARISH_LEAK';end if;
 if public.rc34_demo_parish_call(t,'snapshot','{}')->'roles'->>'admin'<>'false' then raise exception 'ADMIN_ROLE_LEAK';end if;
 perform set_config('rc34.qa.token',t,true);perform set_config('rc34.qa.other_token',u,true);perform set_config('rc34.qa.cycle',c::text,true);
end $$;
reset role;
set local role authenticated;
do $$
declare c uuid:=current_setting('rc34.qa.cycle')::uuid;s jsonb;b jsonb;i jsonb;a uuid;qr uuid;req uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc34.qa.admin'),true);
 s:=public.rc33_demo_cycle_detail('RC33 Sample Parish A',2027);
 if jsonb_array_length(s->'batches')<>2 then raise exception 'REGISTRY_QUEUE_NOT_SYNCED';end if;
 for b in select value from jsonb_array_elements(s->'batches') loop
  perform public.rc33_demo_review_letter((b->>'id')::uuid,1);
  for i in select value from jsonb_array_elements(b->'items') loop perform public.rc33_demo_review_item((b->>'id')::uuid,(i->>'id')::uuid,'approved','',1);end loop;
  perform public.rc33_demo_complete_review((b->>'id')::uuid,1);
  if b->>'preferred_method'='OTC' then a:=public.rc33_demo_group_reviewed(c,array[(b->>'id')::uuid],'OTC');else qr:=public.rc33_demo_group_reviewed(c,array[(b->>'id')::uuid],'QR');end if;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('rc34.qa.finance'),true);
 perform public.rc3_demo_authorize(a);perform public.rc3_demo_authorize(qr);
 select (x->>'payment_request_id')::uuid into req from jsonb_array_elements(public.rc3_demo_snapshot()->'applications') x where x->>'id'=a::text;
 perform public.rc3_demo_post_otc(req,20000,now(),true);
 perform set_config('rc34.qa.qr',qr::text,true);
end $$;
reset role;
set local role anon;
do $$
declare t text:=current_setting('rc34.qa.token');u text:=current_setting('rc34.qa.other_token');q uuid:=current_setting('rc34.qa.qr')::uuid;s jsonb;
begin
 s:=public.rc34_demo_parish_call(t,'snapshot','{}');
 if not exists(select 1 from jsonb_array_elements(s->'batches') x where x->>'financial_status'='renewed' and (x->>'paid_centavos')::bigint=20000) then raise exception 'PAYMENT_NOT_SYNCHRONIZED';end if;
 begin perform public.rc34_demo_parish_call(u,'request_qr',jsonb_build_object('p_application_id',q));raise exception 'CROSS_PARISH_QR';exception when insufficient_privilege then null;end;
 perform public.rc34_demo_parish_call(t,'request_qr',jsonb_build_object('p_application_id',q));perform public.rc34_demo_parish_call(t,'request_qr',jsonb_build_object('p_application_id',q));
end $$;
reset role;
set local role authenticated;
do $$
declare q uuid:=current_setting('rc34.qa.qr')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc34.qa.admin'),true);
 if not exists(select 1 from jsonb_array_elements(public.rc33_demo_cycle_detail('RC33 Sample Parish A',2027)->'batches') x where x->>'aggregate_id'=q::text and (x->>'qr_requested')::boolean) then raise exception 'QR_REQUEST_NOT_VISIBLE';end if;
 perform public.rc3_demo_prepare_qr(q);
end $$;
reset role;
set local role anon;
do $$
declare t text:=current_setting('rc34.qa.token');
begin
 if not exists(select 1 from jsonb_array_elements(public.rc34_demo_parish_call(t,'snapshot','{}')->'batches') x where (x->>'qr_prepared')::boolean) then raise exception 'QR_PREPARATION_NOT_SYNCED';end if;
 perform public.rc34_demo_parish_call(t,'logout','{}');
 begin perform public.rc34_demo_parish_call(t,'snapshot','{}');raise exception 'REVOKED_SESSION_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
reset role;
