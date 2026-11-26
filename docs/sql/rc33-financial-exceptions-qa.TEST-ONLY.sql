-- Execute in rollback-only transaction after the RC3.3 candidate migrations.
select set_config('rc33.qa.admin',(select user_id::text from registry_private.registration_administrators where active and revoked_at is null order by user_id limit 1),true);
select set_config('rc33.qa.finance',(select user_id::text from public.fs_staff_grants where role_code='cowl_finance_verifier' and revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) limit 1),true);
select set_config('rc33.qa.curia',(select user_id::text from public.fs_staff_grants where revoked_at is null and granted_at<=now() and (expires_at is null or expires_at>now()) and role_code in ('curia_receipt_custodian','curia_treasury_reviewer') group by user_id having count(distinct role_code)=2 limit 1),true);
set local role authenticated;
do $$
#variable_conflict use_column
declare c uuid;adv uuid;adv2 uuid;w uuid;w2 uuid;onl uuid;onl2 uuid;g uuid;a uuid;a2 uuid;body jsonb;snap jsonb;b jsonb;it jsonb;result text;coll uuid;receipt uuid;stock uuid;serial uuid;fixture_ref text;remit uuid;fund uuid;rec uuid;req uuid;reject_id uuid;reject_assignment uuid;supp uuid;mid text:='Ministry of Lectors and Commentators';mas text:='Ministry of Altar Servers';mbg text:='Mother Butler Guild';mlm text:='Ministry of Liturgical Music';
begin
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.finance'),true);
 adv:=public.rc33_demo_record_advance('RC33 Sample Parish B',2027,mid,1,5000,true);
 adv2:=public.rc33_demo_record_advance('RC33 Sample Parish B',2027,mas,2,10000,true);
 begin perform public.rc33_demo_record_advance('RC33 Sample Parish B',2027,mid,1,5000,true);raise exception 'DOUBLE_ADVANCE';exception when others then if sqlerrm='DOUBLE_ADVANCE' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.admin'),true);
 c:=public.rc33_demo_open_cycle('RC33 Sample Parish B',2027);
 snap:=public.rc33_demo_snapshot('RC33 Sample Parish B',2027);
 if exists(select 1 from jsonb_array_elements(snap->'roster') x where x->>'renewal_date' is not null) then raise exception 'ADVANCE_PREMATURE_RENEWAL';end if;
 select jsonb_agg(jsonb_build_object('assignment_id',x->>'id','proposal',case when x->>'first' in ('Maria','Jose') then 'renew' else 'no' end)) into body from jsonb_array_elements(snap->'roster') x where x->>'ministry'=mid;
 w:=public.rc33_demo_submit_batch(c,mid,'original','walk_in','OTC',body,'sample.pdf',true,false);
 perform public.rc33_demo_review_letter(w,1);
 select x into b from jsonb_array_elements(public.rc33_demo_snapshot('RC33 Sample Parish B',2027)->'batches') x where x->>'id'=w::text;
 for it in select x from jsonb_array_elements(b->'items') x where x->>'decision'='pending' loop
 if it->>'first_name'='Maria' then perform public.rc33_demo_review_item(w,(it->>'id')::uuid,'approved','',1);
 else reject_id:=(it->>'id')::uuid;reject_assignment:=(it->>'assignment_id')::uuid;perform public.rc33_demo_review_item(w,reject_id,'rejected','Fictional rejection',1);end if;end loop;
 perform public.rc33_demo_complete_review(w,1);
 a:=public.rc33_demo_group_reviewed(c,array[w],'OTC');
 if public.rc33_demo_group_reviewed(c,array[w],'OTC')<>a then raise exception 'GROUP_RETRY';end if;
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.finance'),true);
 begin perform public.rc3_demo_authorize(a);raise exception 'ADVANCE_BYPASS';exception when check_violation then if sqlerrm not like 'Unallocated OTC advance%' then raise;end if;end;
 result:=public.rc33_demo_allocate_advance(adv,a);
 if result<>'receipt_required' then raise exception 'RECEIPT_NOT_REQUIRED';end if;
 select (x->>'collection_id')::uuid into coll from jsonb_array_elements(public.rc33_demo_advance_list('RC33 Sample Parish B',2027)) x where x->>'id'=adv::text;
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.curia'),true);
 fixture_ref:=public.fs_demo_new_rehearsal();
 select id into strict stock from public.fs_receipt_booklets where booklet_reference=fixture_ref||'-BOOK';
 perform public.fs_curia_assign_receipt_booklet(stock,current_setting('rc33.qa.finance')::uuid,true);
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.finance'),true);
 perform public.fs_cowl_acknowledge_receipt_booklet(stock,true);
 select id into strict serial from public.fs_receipt_numbers where booklet_id=stock and status='available' order by printed_no limit 1;
 receipt:=public.fs_issue_official_receipt(coll,serial,true,(now() at time zone 'Asia/Manila')::date,'RC33 Sample Parish B',mid,'DEMO',jsonb_build_array(jsonb_build_object('description','Advance OTC holding','participant_count',1,'fee_centavos',5000,'amount_centavos',5000)));
 remit:=public.fs_submit_cowl_remittance(array[coll],'cash_handover',null,now(),true);
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.curia'),true);
 fund:=public.fs_record_curia_received_funds(remit,'cash_handover',5000,null,null,now(),null);
 perform public.fs_verify_curia_receipt_copy(remit,receipt,true);
 rec:=public.fs_complete_curia_review(remit,fund,'confirmed','DEMO-ACK',null);
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.finance'),true);
 result:=public.rc33_demo_allocate_advance(adv,a);
 if result<>'allocated' or public.rc33_demo_allocate_advance(adv,a)<>'allocated' then raise exception 'ALLOCATION_FAILED';end if;
 if (select count(*) from public.fs_collections where id=coll)<>1 then raise exception 'COLLECTION_DUPLICATED';end if;
 if not exists(select 1 from public.fs_remittances where id=remit and status='curia_confirmed') then raise exception 'CURIA_RECORD_CHANGED';end if;
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.admin'),true);
 snap:=public.rc33_demo_snapshot('RC33 Sample Parish B',2027);
 if not exists(select 1 from jsonb_array_elements(snap->'batches') x where x->>'id'=w::text and x->>'financial_status'='renewed') then raise exception 'ADVANCE_NOT_RENEWED';end if;
 begin perform public.rc33_demo_submit_batch(c,mid,'supplemental','online_rehearsal','OTC',jsonb_build_array(jsonb_build_object('assignment_id',reject_assignment,'proposal','renew')),'sample.pdf',true,false);raise exception 'REJECTED_REUSED';exception when unique_violation then null;end;
 perform public.rc33_demo_reconsider(reject_id,'Registry authorized reconsideration for this fictional assignment');
 supp:=public.rc33_demo_submit_batch(c,mid,'supplemental','online_rehearsal','OTC',jsonb_build_array(jsonb_build_object('assignment_id',reject_assignment,'proposal','renew')),'sample.pdf',true,false);
 -- second advance has a discrepancy; retain as unallocated, no renewal.
 select jsonb_agg(jsonb_build_object('assignment_id',x->>'id','proposal',case when x->>'first'='Maria' then 'renew' else 'no' end)) into body from jsonb_array_elements(snap->'roster') x where x->>'ministry'=mas;
 w2:=public.rc33_demo_submit_batch(c,mas,'original','walk_in','OTC',body,'sample.pdf',true,false);
 perform public.rc33_demo_review_letter(w2,1);
 select x into b from jsonb_array_elements(public.rc33_demo_snapshot('RC33 Sample Parish B',2027)->'batches') x where x->>'id'=w2::text;
 for it in select x from jsonb_array_elements(b->'items') x where x->>'decision'='pending' loop perform public.rc33_demo_review_item(w2,(it->>'id')::uuid,'approved','',1);end loop;
 perform public.rc33_demo_complete_review(w2,1);a2:=public.rc33_demo_group_reviewed(c,array[w2],'OTC');
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.finance'),true);
 if public.rc33_demo_allocate_advance(adv2,a2)<>'discrepancy' then raise exception 'MISMATCH_NOT_FLAGGED';end if;
 if not exists(select 1 from jsonb_array_elements(public.rc33_demo_advance_list('RC33 Sample Parish B',2027)) x where x->>'id'=adv2::text and x->>'allocated_application' is null and x->>'discrepancy_note' is not null) then raise exception 'DISCREPANCY_NOT_RETAINED';end if;
 -- Two same-method original ministries can be grouped; changed method audited.
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.admin'),true);
 select jsonb_agg(jsonb_build_object('assignment_id',x->>'id','proposal',case when x->>'first'='Maria' then 'renew' else 'no' end)) into body from jsonb_array_elements(snap->'roster') x where x->>'ministry'=mbg;
 onl:=public.rc33_demo_submit_batch(c,mbg,'original','online_rehearsal','QR',body,'sample.pdf',true,false);
 select jsonb_agg(jsonb_build_object('assignment_id',x->>'id','proposal',case when x->>'first'='Maria' then 'renew' else 'no' end)) into body from jsonb_array_elements(snap->'roster') x where x->>'ministry'=mlm;
 onl2:=public.rc33_demo_submit_batch(c,mlm,'original','online_rehearsal','OTC',body,'sample.pdf',true,false);
 foreach w in array array[onl,onl2] loop
 perform public.rc33_demo_review_letter(w,1);
 select x into b from jsonb_array_elements(public.rc33_demo_snapshot('RC33 Sample Parish B',2027)->'batches') x where x->>'id'=w::text;
 for it in select x from jsonb_array_elements(b->'items') x where x->>'decision'='pending' loop perform public.rc33_demo_review_item(w,(it->>'id')::uuid,'approved','',1);end loop;
 perform public.rc33_demo_complete_review(w,1);
 end loop;
 begin perform public.rc33_demo_group_reviewed(c,array[onl,onl2],'QR');raise exception 'MIXED_METHOD_GROUPED';exception when others then if sqlerrm='MIXED_METHOD_GROUPED' then raise;end if;end;
 perform public.rc33_demo_change_method(onl2,'QR','Coordinator requested QR');
 g:=public.rc33_demo_group_reviewed(c,array[onl,onl2],'QR');
 if public.rc33_demo_group_reviewed(c,array[onl2,onl],'QR')<>g then raise exception 'GROUP_RETRY_WRONG';end if;
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.finance'),true);
 perform public.rc3_demo_authorize(g);
 if (select count(*) from jsonb_array_elements(public.rc33_demo_group_detail(g)))<>2 then raise exception 'GROUP_BREAKDOWN';end if;
 perform set_config('request.jwt.claim.sub',current_setting('rc33.qa.admin'),true);
 snap:=public.rc33_demo_snapshot('RC33 Sample Parish B',2027);
 if (select count(*) from jsonb_array_elements(snap->'roster') x where x->>'renewal_date' is not null)<>1 then raise exception 'UNAPPROVED_ADVANCE_OR_GROUP_RENEWED';end if;
end $$;
