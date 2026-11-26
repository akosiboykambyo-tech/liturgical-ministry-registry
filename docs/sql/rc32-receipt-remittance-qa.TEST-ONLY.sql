-- Run inside a rollback transaction with isolated TEST fixtures only.
select set_config('rc32.qa.admin',(select user_id::text from registry_private.registration_administrators where active and revoked_at is null order by user_id limit 1),true);
select set_config('rc32.qa.finance',(select user_id::text from public.fs_staff_grants where role_code='cowl_finance_verifier' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) limit 1),true);
select set_config('rc32.qa.curia',(select user_id::text from public.fs_staff_grants where revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) and role_code in ('curia_receipt_custodian','curia_treasury_reviewer') group by user_id having count(distinct role_code)=2 limit 1),true);
set local role authenticated;
do $$
#variable_conflict use_column
declare s jsonb; snap jsonb; payload jsonb; b uuid; a uuid; req uuid; x jsonb; l jsonb; rev int; rejected uuid; c uuid;
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
 if convert_from(substring(decode(public.rc32_demo_read_letter(b,'Ministry of Altar Servers')->>'base64','base64') for 8),'UTF8')<>'%PDF-1.4' then raise exception 'Invalid generated PDF header';end if;
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
 begin perform public.rc32_demo_read_letter(b,'Ministry of Altar Servers');raise exception 'FINANCE_DOCUMENT_READ_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.rc32_demo_open_draft('RC32 Sample Parish B',2031,'walk_in');raise exception 'FINANCE_WRITE_ACCEPTED';exception when insufficient_privilege then null;end;
 perform public.rc3_demo_authorize(a);
 select (x->>'payment_request_id')::uuid into req from jsonb_array_elements(public.rc3_demo_snapshot()->'applications') x where x->>'id'=a::text;
 begin perform public.fs_record_otc_payment(req,5000,now(),true);raise exception 'PARTIAL_ACCEPTED';exception when check_violation then if sqlerrm not like 'RC3 renewal requires full payment%' then raise;end if;end;
 c:=public.rc3_demo_post_otc(req,25000,now(),true);
 if not exists(select 1 from jsonb_array_elements(public.rc3_demo_snapshot()->'applications') x where x->>'id'=a::text and x->>'status'='renewed' and (x->>'paid_centavos')::bigint=25000) then raise exception 'Consolidated settlement failed';end if;
 declare fixture_ref text; stock_id uuid; serial_id uuid; issue_id uuid; remit_id uuid; fund_id uuid; checked_id uuid; lines jsonb;
 begin
 perform set_config('request.jwt.claim.sub',current_setting('rc32.qa.curia'),true);
 fixture_ref:=public.fs_demo_new_rehearsal();
 select id into strict stock_id from public.fs_receipt_booklets where booklet_reference=fixture_ref||'-BOOK';
 perform public.fs_curia_assign_receipt_booklet(stock_id,current_setting('rc32.qa.finance')::uuid,true);
 perform set_config('request.jwt.claim.sub',current_setting('rc32.qa.finance'),true);
 perform public.fs_cowl_acknowledge_receipt_booklet(stock_id,true);
 select id into strict serial_id from public.fs_receipt_numbers where booklet_id=stock_id and status='available' order by printed_no limit 1;
 select jsonb_agg(jsonb_build_object('description',br->>'ministry','participant_count',(br->>'count')::int,'fee_centavos',5000,'amount_centavos',(br->>'count')::int*5000)) into lines from jsonb_array_elements(public.rc32_demo_snapshot(null)->'submissions') parent cross join lateral jsonb_array_elements(parent->'breakdown') br where parent->>'id'=b::text;
 issue_id:=public.fs_issue_official_receipt(c,serial_id,true,(now() at time zone 'Asia/Manila')::date,'RC32 Sample Parish A','Consolidated Parish Renewal','DEMO',lines);
 remit_id:=public.fs_submit_cowl_remittance(array[c],'cash_handover',null,now(),true);
 perform set_config('request.jwt.claim.sub',current_setting('rc32.qa.curia'),true);
 fund_id:=public.fs_record_curia_received_funds(remit_id,'cash_handover',25000,null,null,now(),null);
 begin perform public.fs_complete_curia_review(remit_id,fund_id,'confirmed','DEMO-ACK',null);raise exception 'PREMATURE_CURIA_ACCEPTED';exception when others then if sqlerrm='PREMATURE_CURIA_ACCEPTED' then raise;end if;end;
 perform public.fs_verify_curia_receipt_copy(remit_id,issue_id,true);
 checked_id:=public.fs_complete_curia_review(remit_id,fund_id,'confirmed','DEMO-ACK',null);
 if checked_id is null or not exists(select 1 from public.fs_remittances where id=remit_id and status='curia_confirmed') then raise exception 'Curia reconciliation failed';end if;
 end;
 perform set_config('request.jwt.claim.sub',current_setting('rc32.qa.admin'),true);
 if exists(select 1 from jsonb_array_elements(public.rc32_demo_snapshot('RC32 Sample Parish A')->'roster') x where x->>'id'=rejected::text and x->>'renewal_date' is not null) then raise exception 'Rejected assignment renewed';end if;
 if (select count(*) from jsonb_array_elements(public.rc32_demo_snapshot('RC32 Sample Parish A')->'roster') x where x->>'renewal_date' is not null)<>5 then raise exception 'Wrong validated count';end if;
end $$;
