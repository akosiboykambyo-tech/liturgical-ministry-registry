-- TEST ONLY. Atomically submit selected, independently prepared online ministry drafts.
create function rc33_demo.submit_parish_drafts(p_cycle uuid,p_drafts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d rc33_demo.drafts%rowtype;v jsonb;result jsonb:='[]';b uuid;n integer;
begin
 perform rc32_demo.require_admin();
 perform 1 from rc33_demo.cycles where id=p_cycle for update;
 if not found or p_drafts is null or jsonb_typeof(p_drafts)<>'array' then raise exception 'Invalid parish submission';end if;
 n:=jsonb_array_length(p_drafts);
 if n not between 1 and 6 or (select count(distinct x->>'id') from jsonb_array_elements(p_drafts) x)<>n then raise exception 'Select distinct ministry drafts';end if;
 -- Check all revisions and scope before writing any application.
 for v in select value from jsonb_array_elements(p_drafts) order by value->>'id' loop
  select * into strict d from rc33_demo.drafts where id=(v->>'id')::uuid and cycle_id=p_cycle for update;
  if d.channel<>'online_rehearsal' or d.replace_batch is not null or v->>'revision' is null or not ((d.state='draft' and d.revision=(v->>'revision')::integer) or (d.state='submitted' and d.revision=(v->>'revision')::integer+1 and d.submitted_batch is not null)) then raise exception 'Draft changed or is not in this parish submission' using errcode='40001';end if;
  if not coalesce((d.payload->>'confirmed')::boolean,false) or not coalesce((d.payload->>'roster_confirmed')::boolean,false) or not coalesce((d.payload->>'letter_confirmed')::boolean,false) then raise exception 'Roster and recommendation confirmation required';end if;
 end loop;
 if (select count(distinct ministry) from rc33_demo.drafts where id in (select (x->>'id')::uuid from jsonb_array_elements(p_drafts) x))<>n then raise exception 'One prepared application per ministry';end if;
 for v in select value from jsonb_array_elements(p_drafts) order by value->>'id' loop
  b:=rc33_demo.submit_draft((v->>'id')::uuid,(v->>'revision')::integer);
  result:=result||jsonb_build_array(b);
 end loop;
 return result;
end $$;
create function public.rc33_demo_submit_parish_drafts(p_cycle uuid,p_drafts jsonb) returns jsonb
language sql security invoker set search_path='' as $$select rc33_demo.submit_parish_drafts(p_cycle,p_drafts)$$;
revoke all on function rc33_demo.submit_parish_drafts(uuid,jsonb),public.rc33_demo_submit_parish_drafts(uuid,jsonb) from public,anon,authenticated;
grant execute on function rc33_demo.submit_parish_drafts(uuid,jsonb),public.rc33_demo_submit_parish_drafts(uuid,jsonb) to authenticated;
