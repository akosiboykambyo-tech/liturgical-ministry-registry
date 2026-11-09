-- ROLLBACK-ONLY STAGING QA: separate Curia and COWL custody.
-- Requires at least 3 existing Auth test users. No grants or receipt stock persist.
begin;
do $fixture$
declare ids uuid[];
begin
 select array_agg(id order by id) into ids from auth.users;
 if cardinality(ids)<3 then raise exception 'Need three existing isolated test users'; end if;
 perform set_config('fs_stage.curia',ids[1]::text,true);
 perform set_config('fs_stage.cowl',ids[2]::text,true);
 perform set_config('fs_stage.unauthorized',ids[3]::text,true);
 insert into public.fs_staff_grants(user_id,role_code,granted_by)
 values(ids[1],'curia_receipt_custodian',ids[1]),
 (ids[1],'cowl_receipt_issuer',ids[1]),
 (ids[2],'cowl_receipt_issuer',ids[1]);
end $fixture$;
set local role authenticated;
do $test$
declare
 curia uuid:=current_setting('fs_stage.curia')::uuid;
 cowl uuid:=current_setting('fs_stage.cowl')::uuid;
 unapproved uuid:=current_setting('fs_stage.unauthorized')::uuid;
 serie uuid; booklet uuid; serial_count int; recipient_count int;
begin
 perform set_config('request.jwt.claim.sub',unapproved::text,true);
 begin
   perform public.fs_curia_register_receipt_series('TEST DIOCESE','TEST-STAGING');
   raise exception 'FAIL: unapproved account registered series';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',curia::text,true);
 serie:=public.fs_curia_register_receipt_series('TEST DIOCESE','TEST-STAGING');
 select count(*) into recipient_count from public.fs_curia_list_cowl_custodians()
  where user_id=cowl;
 if recipient_count<>1 then raise exception 'FAIL: assigned COWL custodian absent'; end if;
 begin
   perform public.fs_curia_register_checked_booklet(serie,'TEST-STAGING-BOOKLET','009901','009902',false);
   raise exception 'FAIL: unchecked booklet registered';
 exception when raise_exception then
   if sqlerrm like 'FAIL:%' then raise; end if;
 end;
 booklet:=public.fs_curia_register_checked_booklet(
   serie,'TEST-STAGING-BOOKLET','009901','009902',true);
 select count(*) into serial_count from public.fs_receipt_numbers where booklet_id=booklet;
 if serial_count<>2 then raise exception 'FAIL: stock range count'; end if;
 begin
   perform public.fs_curia_assign_receipt_booklet(booklet,curia,true);
   raise exception 'FAIL: dual-role Curia custodian self-assigned';
 exception when raise_exception then
   if sqlerrm like 'FAIL:%' then raise; end if;
 end;
 perform public.fs_curia_assign_receipt_booklet(booklet,cowl,true);
 perform set_config('request.jwt.claim.sub',cowl::text,true);
 perform public.fs_cowl_acknowledge_receipt_booklet(booklet,true);
 if (select custody_state from public.fs_receipt_booklets where id=booklet)<>'cowl_custody'
 then raise exception 'FAIL: custody acknowledgment'; end if;
end $test$;
rollback;
