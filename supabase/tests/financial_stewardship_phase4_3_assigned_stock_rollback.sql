-- Phase 4.3 assigned-stock security test. Synthetic transactions ROLLBACK.
begin;
do $init$
declare
  v_curia uuid;
  v_cowl uuid;
  v_other uuid;
begin
 select id into strict v_curia from auth.users where email='g.felarca10@gmail.com';
 select id into strict v_cowl from auth.users where email='akosiboykambyo@gmail.com';
 select id into strict v_other from auth.users where email='roj.ocenar@gmail.com';
 insert into public.fs_staff_grants(
   user_id,role_code,granted_by,provisioning_method)
 values (v_other,'cowl_receipt_issuer',v_curia,'staff_approved');
 perform set_config('fs_stage.curia',v_curia::text,true);
 perform set_config('fs_stage.cowl',v_cowl::text,true);
 perform set_config('fs_stage.other',v_other::text,true);
end $init$;
set local role authenticated;
do $test$
declare
 v_curia uuid:=current_setting('fs_stage.curia')::uuid;
 v_cowl uuid:=current_setting('fs_stage.cowl')::uuid;
 v_other uuid:=current_setting('fs_stage.other')::uuid;
 v_series uuid;
 v_booklet uuid;
 v_number uuid;
begin
 perform set_config('request.jwt.claim.sub',v_cowl::text,true);
 begin
   perform public.fs_curia_register_receipt_series('TEST ISSUING OFFICE','TEST-ROLE-SERIES');
   raise exception 'FAIL: COWL impersonated Curia stock registration';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',v_curia::text,true);
 v_series:=public.fs_curia_register_receipt_series('TEST ISSUING OFFICE','TEST-ROLE-SERIES');
 v_booklet:=public.fs_curia_register_checked_booklet(v_series,'STAGE-BOOKLET','000901','000902',true);
 perform public.fs_curia_assign_receipt_booklet(v_booklet,v_cowl,true);
 perform set_config('request.jwt.claim.sub',v_cowl::text,true);
 perform public.fs_cowl_acknowledge_receipt_booklet(v_booklet,true);
 select id into strict v_number from public.fs_receipt_numbers
 where booklet_id=v_booklet and printed_no='000901';
 perform set_config('request.jwt.claim.sub',v_other::text,true);
 begin
   perform public.fs_cowl_report_receipt_exception(
     v_number,'voided','Physical page torn in test',true);
   raise exception 'FAIL: Another authorized officer changed unassigned stock';
 exception when raise_exception then
   if sqlerrm like 'FAIL:%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',v_cowl::text,true);
 perform public.fs_cowl_report_receipt_exception(
   v_number,'voided','Physical page torn in test',true);
 if (select status from public.fs_receipt_numbers where id=v_number)<>'voided' then
   raise exception 'FAIL: Assigned COWL receipt exception not recorded';
 end if;
end $test$;
rollback;