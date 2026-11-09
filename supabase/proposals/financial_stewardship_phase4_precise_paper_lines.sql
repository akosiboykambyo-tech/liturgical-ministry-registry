-- Phase 4 test-only receipt issuance refinement.
-- The old prototype transaction generated a placeholder line description.
-- Remove that overload: genuine printed receipt breakdown must be supplied.
drop function public.fs_issue_official_receipt(uuid,uuid,boolean,date,text,text,text);
drop function fs_internal.issue_preprinted_receipt(uuid,uuid,boolean,date,text,text,text);

create function fs_internal.issue_preprinted_receipt(
 p_collection_id uuid,p_receipt_number_id uuid,p_paper_checked boolean,
 p_issue_date date,p_payer_written text,p_ministry_written text,
 p_code_written text,p_paper_lines jsonb
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_collection public.fs_collections%rowtype;
 v_number public.fs_receipt_numbers%rowtype;
 v_booklet public.fs_receipt_booklets%rowtype;
 v_issue uuid;
 v_line jsonb;
 v_description text;
 v_participants integer;
 v_fee bigint;
 v_amount bigint;
 v_sum bigint:=0;
 v_line_no int:=0;
begin
 if v_actor is null or not fs_internal.has_staff_role('cowl_receipt_issuer') then
   raise exception 'COWL receipt issuer authorization required' using errcode='42501';
 end if;
 if not coalesce(p_paper_checked,false) or p_issue_date is null
   or length(btrim(coalesce(p_payer_written,'')))<2
   or length(btrim(coalesce(p_ministry_written,'')))<2 then
   raise exception 'Physical paper verification, issue date and actual written names required';
 end if;
 if p_paper_lines is null or jsonb_typeof(p_paper_lines)<>'array'
    or jsonb_array_length(p_paper_lines) not between 1 and 50 then
   raise exception 'Actual paper breakdown must contain 1 to 50 lines';
 end if;
 select * into strict v_collection from public.fs_collections
   where id=p_collection_id for update;
 if v_collection.status<>'posted' then raise exception 'Collection is not posted'; end if;
 if exists(select 1 from public.fs_receipt_issues where collection_id=p_collection_id) then
   raise exception 'Collection already has an official receipt';
 end if;
 select * into strict v_number from public.fs_receipt_numbers
   where id=p_receipt_number_id for update;
 select * into strict v_booklet from public.fs_receipt_booklets
   where id=v_number.booklet_id for update;
 if v_booklet.custody_state<>'cowl_custody' or v_number.status<>'available' then
   raise exception 'Printed receipt is unavailable or not acknowledged in COWL custody';
 end if;

 -- All lines are checked BEFORE paper issue is recorded and the stock state is updated.
 for v_line in select value from jsonb_array_elements(p_paper_lines) loop
   v_line_no:=v_line_no+1;
   if jsonb_typeof(v_line)<>'object' then raise exception 'Invalid paper line'; end if;
   v_description:=btrim(coalesce(v_line->>'description',''));
   v_participants:=nullif(v_line->>'participant_count','')::integer;
   v_fee:=nullif(v_line->>'fee_centavos','')::bigint;
   v_amount:=(v_line->>'amount_centavos')::bigint;
   if length(v_description) not between 1 and 250 or v_amount is null or v_amount<=0 then
     raise exception 'Receipt paper description and positive line amount required';
   end if;
   if (v_participants is null)<>(v_fee is null) then
     raise exception 'Paper count and rate must be recorded together';
   end if;
   if v_participants is not null and
     (v_participants<=0 or v_fee<0 or v_participants::bigint*v_fee<>v_amount) then
      raise exception 'Printed participant count x fee does not equal line amount';
   end if;
   v_sum:=v_sum+v_amount;
 end loop;
 if v_sum<>v_collection.amount_centavos then
   raise exception 'Physical receipt line total does not equal verified collection';
 end if;
 insert into public.fs_receipt_issues(
 receipt_number_id,collection_id,issue_date,payer_written_name,
 ministry_written_name,printed_accounting_code,amount_centavos,issued_by)
 values(v_number.id,v_collection.id,p_issue_date,p_payer_written,
    p_ministry_written,p_code_written,v_collection.amount_centavos,v_actor)
 returning id into v_issue;
 v_line_no:=0;
 for v_line in select value from jsonb_array_elements(p_paper_lines) loop
   v_line_no:=v_line_no+1;
   insert into public.fs_receipt_issue_lines(
     receipt_issue_id,description,participant_count,fee_centavos,
     amount_centavos,line_no)
   values(v_issue,btrim(v_line->>'description'),
     nullif(v_line->>'participant_count','')::integer,
     nullif(v_line->>'fee_centavos','')::bigint,
     (v_line->>'amount_centavos')::bigint,v_line_no);
 end loop;
 update public.fs_receipt_numbers set status='issued' where id=v_number.id;
 insert into public.fs_audit_events(entity_kind,entity_id,action,actor_id,metadata)
 values('receipt_issue',v_issue,'exact_preprinted_receipt_issued',v_actor,
   pg_catalog.jsonb_build_object(
      'receipt_number_id',v_number.id,'collection_id',v_collection.id,
      'paper_line_count',v_line_no));
 return v_issue;
exception when no_data_found then
 raise exception 'Collection, printed receipt or booklet not found';
end; $$;

revoke all on function fs_internal.issue_preprinted_receipt(
 uuid,uuid,boolean,date,text,text,text,jsonb) from public,anon;
grant execute on function fs_internal.issue_preprinted_receipt(
 uuid,uuid,boolean,date,text,text,text,jsonb) to authenticated;
create function public.fs_issue_official_receipt(
 p_collection_id uuid,p_receipt_number_id uuid,p_paper_checked boolean,
 p_issue_date date,p_payer_written text,p_ministry_written text,
 p_code_written text,p_paper_lines jsonb
) returns uuid language sql security invoker set search_path=''
as $$
 select fs_internal.issue_preprinted_receipt(
  p_collection_id,p_receipt_number_id,p_paper_checked,p_issue_date,
  p_payer_written,p_ministry_written,p_code_written,p_paper_lines);
$$;
revoke all on function public.fs_issue_official_receipt(
 uuid,uuid,boolean,date,text,text,text,jsonb) from public,anon;
grant execute on function public.fs_issue_official_receipt(
 uuid,uuid,boolean,date,text,text,text,jsonb) to authenticated;
