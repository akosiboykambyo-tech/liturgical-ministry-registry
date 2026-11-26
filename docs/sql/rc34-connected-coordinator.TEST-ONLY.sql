-- RC3.4 TEST coordinator integration; private shared core; no production access.
CREATE FUNCTION rc33_demo.core_open_cycle(p_actor uuid, p_parish text, p_year integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 if p_actor is null then raise exception 'Intake actor required' using errcode='42501';end if;
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 then raise exception 'Unknown fictional parish or year';end if;
 select id into v_id from rc33_demo.cycles where parish=p_parish and service_year=p_year;
 if found then return v_id;end if;
 perform rc33_demo.assert_active_intake(p_year);
 insert into rc33_demo.cycles(parish,service_year) values(p_parish,p_year) on conflict(parish,service_year) do nothing;
 select id into strict v_id from rc33_demo.cycles where parish=p_parish and service_year=p_year;return v_id;
end $function$
;
CREATE FUNCTION rc33_demo.core_write_batch(p_actor uuid, p_cycle uuid, p_ministry text, p_kind text, p_channel text, p_method text, p_items jsonb, p_letter text, p_confirmed boolean, p_zero boolean, p_replace uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c rc33_demo.cycles%rowtype; b uuid; old rc33_demo.batches%rowtype; parent rc33_demo.batches%rowtype; r jsonb; a record; aid uuid; k text; f text;l text;pf text;pl text; n integer; existing_count integer; chosen_count integer:=0;
begin
 if p_actor is null then raise exception 'Intake actor required' using errcode='42501';end if;
 select * into strict c from rc33_demo.cycles where id=p_cycle for update;
 if not exists(select 1 from rc32_demo.ministries where name=p_ministry) or p_kind is null or p_kind not in ('original','supplemental') or p_channel is null or p_channel not in ('walk_in','online_rehearsal') or p_method is null or p_method not in ('OTC','QR') or not coalesce(p_confirmed,false) or p_zero is null then raise exception 'Valid ministry, source, method and roster confirmation required';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>150 or octet_length(p_items::text)>150000 then raise exception 'Invalid fictional roster payload';end if;
 if p_kind='supplemental' then
  select * into strict parent from rc33_demo.batches where cycle_id=c.id and ministry=p_ministry and kind='original';
  if not(parent.status='closed_no_charge' or (parent.status='reviewed' and exists(select 1 from rc3_demo.applications x where x.id=parent.aggregate_id and x.status in ('awaiting_payment','renewed')))) then raise exception 'Original application must be closed or payment authorized before supplemental intake';end if;
  if p_zero then raise exception 'Supplemental application requires additional recommendations';end if;
 end if;
 n:=0;
 for r in select value from jsonb_array_elements(p_items) loop
  k:=r->>'proposal';if k is null or k not in ('renew','hold','no','new_member','ministry_assignment','identity_review') then raise exception 'Invalid proposal';end if;
  if k<>'no' then n:=n+1;end if;
 end loop;
 if n=0 then
  if not p_zero or nullif(trim(coalesce(p_letter,'')),'') is not null then raise exception 'Explicit zero declaration required';end if;
 else
  if p_zero or length(trim(coalesce(p_letter,''))) not between 1 and 150 or p_letter!~*'\.pdf$' then raise exception 'Recommendation PDF covering these names required';end if;
 end if;
 if p_replace is null then
 insert into rc33_demo.batches(cycle_id,ministry,kind,parent_id,channel,preferred_method,letter_name,zero_declaration,submitted_by)
 values(c.id,p_ministry,p_kind,parent.id,p_channel,p_method,case when n>0 then trim(p_letter) end,p_zero,p_actor) returning id into b;
 else
 select * into strict old from rc33_demo.batches where id=p_replace and cycle_id=c.id for update;
 if old.status<>'returned' or old.ministry<>p_ministry or old.kind<>p_kind or old.channel<>p_channel or old.aggregate_id is not null then raise exception 'Only the returned ungrouped ministry batch may be corrected';end if;
 b:=old.id;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(c.id,b,p_actor,'prior_revision_archived',jsonb_build_object('batch',to_jsonb(old),'items',(select jsonb_agg(to_jsonb(i)) from rc33_demo.items i where i.batch_id=b)));
 delete from rc33_demo.items where batch_id=b;
 update rc33_demo.batches set revision=revision+1,status='submitted',return_note=null,preferred_method=p_method,letter_name=case when n>0 then trim(p_letter) end,zero_declaration=p_zero,letter_reviewed_by=null,letter_reviewed_at=null,reviewed_by=null,reviewed_at=null,submitted_at=now() where id=b;
 end if;
 for r in select value from jsonb_array_elements(p_items) loop
  k:=r->>'proposal';aid:=nullif(r->>'assignment_id','')::uuid;
  if aid is not null then
   if k not in ('renew','hold','no','identity_review') then raise exception 'Invalid existing assignment proposal';end if;
   select z.id,rr.first_name,rr.last_name into strict a from rc33_demo.roster rr join rc3_demo.assignments z on z.id=rr.assignment_id where z.id=aid and z.parish=c.parish and z.ministry=p_ministry;
   f:=a.first_name;l:=a.last_name;chosen_count:=chosen_count+1;
  else
   if k not in ('new_member','ministry_assignment','identity_review') then raise exception 'Existing assignment ID required';end if;
   f:=trim(coalesce(r->>'first_name',''));l:=trim(coalesce(r->>'last_name',''));
   if length(f) not between 1 and 100 or length(l) not between 1 and 100 or f~'^[=+@-]' or l~'^[=+@-]' or f~'[[:cntrl:]]' or l~'[[:cntrl:]]' then raise exception 'Invalid fictional name';end if;
   if exists(select 1 from rc33_demo.roster rr join rc3_demo.assignments z on z.id=rr.assignment_id where z.parish=c.parish and z.ministry=p_ministry and rc33_demo.name_key(rr.first_name,rr.last_name)=rc33_demo.name_key(f,l)) then raise exception 'Existing assignment must be referenced by ID';end if;
  end if;
  pf:=nullif(trim(coalesce(r->>'proposed_first','')),'');pl:=nullif(trim(coalesce(r->>'proposed_last','')),'');
  if pf is not null or pl is not null then
   if aid is null or k<>'identity_review' or pf is null or pl is null or length(pf)>100 or length(pl)>100 or pf~'^[=+@-]' or pl~'^[=+@-]' or pf~'[[:cntrl:]]' or pl~'[[:cntrl:]]' then raise exception 'Invalid proposed identity correction';end if;
  end if;
  if p_kind='supplemental' and k='no' then raise exception 'Supplemental batch contains additions only';end if;
  insert into rc33_demo.items(batch_id,cycle_id,ministry,assignment_id,first_name,last_name,name_key,proposal,decision,proposed_first,proposed_last)
  values(b,c.id,p_ministry,aid,f,l,rc33_demo.name_key(f,l),k,case when k='no' then 'excluded' else 'pending' end,pf,pl);
 end loop;
 if p_kind='original' then
  select count(*) into existing_count from rc33_demo.roster rr join rc3_demo.assignments z on z.id=rr.assignment_id where z.parish=c.parish and z.ministry=p_ministry;
  if chosen_count<>existing_count then raise exception 'Every existing ministry assignment needs an explicit roster decision';end if;
 end if;
 insert into rc33_demo.events(cycle_id,batch_id,actor,action,details) values(c.id,b,p_actor,'batch_submitted',jsonb_build_object('kind',p_kind,'channel',p_channel,'method',p_method,'recommended',n));
 return b;
end $function$
;
CREATE FUNCTION rc33_demo.core_open_draft(p_actor uuid, p_cycle uuid, p_ministry text, p_kind text, p_channel text, p_replace uuid DEFAULT NULL::uuid, p_takeover boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c rc33_demo.cycles%rowtype;d rc33_demo.drafts%rowtype;b rc33_demo.batches%rowtype;items jsonb;
begin
 if p_actor is null then raise exception 'Intake actor required' using errcode='42501';end if;select * into strict c from rc33_demo.cycles where id=p_cycle for update;
 perform rc33_demo.assert_active_intake(c.service_year);
 if p_kind is null or p_kind not in ('original','supplemental') or p_channel is null or p_channel not in ('walk_in','online_rehearsal') or not exists(select 1 from rc32_demo.ministries where name=p_ministry) then raise exception 'Invalid draft scope';end if;
 if p_replace is not null then
  select * into strict b from rc33_demo.batches where id=p_replace and cycle_id=c.id for update;
  if b.status<>'returned' or b.ministry<>p_ministry or b.kind<>p_kind or b.channel<>p_channel then raise exception 'Only the returned ministry may be corrected';end if;
 elsif p_kind='original' and exists(select 1 from rc33_demo.batches where cycle_id=c.id and ministry=p_ministry and kind='original') then
  raise exception 'Original ministry already submitted; view existing record';
 elsif p_kind='supplemental' and not exists(select 1 from rc33_demo.batches orig left join rc3_demo.applications a on a.id=orig.aggregate_id where orig.cycle_id=c.id and orig.ministry=p_ministry and orig.kind='original' and (orig.status='closed_no_charge' or (orig.status='reviewed' and a.status in ('awaiting_payment','renewed')))) then
  raise exception 'Original must be authorized or closed before supplements';
 end if;
 select * into d from rc33_demo.drafts where cycle_id=c.id and ministry=p_ministry and kind=p_kind and state='draft' for update;
 if found then
  if d.replace_batch is distinct from p_replace then raise exception 'Another draft is active for this ministry';end if;
  if d.channel=p_channel then return to_jsonb(d)-'created_by';end if;
  if p_channel<>'walk_in' or d.channel<>'online_rehearsal' or p_replace is not null or not coalesce(p_takeover,false) then raise exception 'A draft from the other intake channel is active; explicit staff takeover required';end if;
  update rc33_demo.drafts set state='superseded',revision=revision+1,updated_at=now() where id=d.id;
  insert into rc33_demo.events(cycle_id,actor,action,details) values(c.id,p_actor,'online_draft_superseded_by_walk_in',jsonb_build_object('draft',to_jsonb(d),'ministry',p_ministry));
 end if;
 if p_replace is not null then
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',i.assignment_id,'first_name',i.first_name,'last_name',i.last_name,'proposal',i.proposal,'proposed_first',i.proposed_first,'proposed_last',i.proposed_last)),'[]') into items from rc33_demo.items i where i.batch_id=b.id;
 elsif p_kind='original' then
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',z.id,'proposal','renew')),'[]') into items from rc33_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.parish=c.parish and z.ministry=p_ministry;
 else items:='[]';
 end if;
 insert into rc33_demo.drafts(cycle_id,ministry,kind,channel,replace_batch,payload,created_by) values(c.id,p_ministry,p_kind,p_channel,p_replace,jsonb_build_object('items',items,'method',coalesce(b.preferred_method,'OTC'),'confirmed',false,'letter',b.letter_name,'zero',false),p_actor) returning * into d;
 return to_jsonb(d)-'created_by';
end $function$
;
CREATE FUNCTION rc33_demo.core_save_draft(p_actor uuid, p_id uuid, p_revision integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d rc33_demo.drafts%rowtype;c uuid;
begin
 if p_actor is null then raise exception 'Intake actor required' using errcode='42501';end if;
 select cycle_id into strict c from rc33_demo.drafts where id=p_id;
 perform 1 from rc33_demo.cycles where id=c for update;
 select * into strict d from rc33_demo.drafts where id=p_id for update;
 if d.state<>'draft' or d.revision is distinct from p_revision then raise exception 'Draft changed or was submitted elsewhere; reload' using errcode='40001';end if;
 if d.kind='original' and d.replace_batch is null and exists(select 1 from rc33_demo.batches b where b.cycle_id=c and b.ministry=d.ministry and b.kind='original') then raise exception 'Walk-in or online original already exists; reload cycle' using errcode='40001';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>150 or octet_length(p_payload::text)>150000 then raise exception 'Invalid draft';end if;
 update rc33_demo.drafts set payload=p_payload,revision=revision+1,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)-'created_by';
end $function$
;
CREATE FUNCTION rc33_demo.core_submit_draft(p_actor uuid, p_id uuid, p_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d rc33_demo.drafts%rowtype;c uuid;b uuid;
begin
 if p_actor is null then raise exception 'Intake actor required' using errcode='42501';end if;
 select cycle_id into strict c from rc33_demo.drafts where id=p_id;
 perform 1 from rc33_demo.cycles where id=c for update;
 select * into strict d from rc33_demo.drafts where id=p_id for update;
 if d.state='submitted' and d.revision=p_revision+1 then return d.submitted_batch;end if;
 if d.state<>'draft' or d.revision is distinct from p_revision then raise exception 'Draft changed; reload' using errcode='40001';end if;
 b:=rc33_demo.core_write_batch(p_actor,d.cycle_id,d.ministry,d.kind,d.channel,d.payload->>'method',d.payload->'items',d.payload->>'letter',(d.payload->>'confirmed')::boolean,(d.payload->>'zero')::boolean,d.replace_batch);
 update rc33_demo.drafts set state='submitted',submitted_batch=b,revision=revision+1,updated_at=now() where id=d.id;
 return b;
end $function$
;
CREATE FUNCTION rc33_demo.core_submit_parish_drafts(p_actor uuid, p_cycle uuid, p_drafts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d rc33_demo.drafts%rowtype;v jsonb;result jsonb:='[]';b uuid;n integer;
begin
 if p_actor is null then raise exception 'Intake actor required' using errcode='42501';end if;
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
  b:=rc33_demo.core_submit_draft(p_actor,(v->>'id')::uuid,(v->>'revision')::integer);
  result:=result||jsonb_build_array(b);
 end loop;
 return result;
end $function$
;
CREATE FUNCTION rc33_demo.core_snapshot(p_parish text, p_year integer, admin boolean, finance boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not(admin or finance) then raise exception 'Read scope required' using errcode='42501';end if;
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 then raise exception 'Unknown fictional parish or year';end if;
 return jsonb_build_object('roles',jsonb_build_object('admin',admin,'finance',finance),
 'cycle',(select id from rc33_demo.cycles where parish=p_parish and service_year=p_year),
 'roster',case when admin then coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'first',r.first_name,'last',r.last_name,'ministry',z.ministry,'renewal_date',z.renewal_date)) from rc33_demo.roster r join rc3_demo.assignments z on z.id=r.assignment_id where z.parish=p_parish),'[]') else '[]'::jsonb end,
 'batches',coalesce((select jsonb_agg((to_jsonb(b)-'submitted_by'-'reviewed_by'-'letter_reviewed_by')||jsonb_build_object('letter_reviewed',b.letter_reviewed_by is not null,'financial_status',a.status,'due_centavos',a.due_centavos,'paid_centavos',a.paid_centavos,'payment_reference',p.payment_reference,'approved_count',(select count(*) from rc33_demo.items where batch_id=b.id and decision='approved'),'batch_amount_centavos',(select count(*)*5000 from rc33_demo.items where batch_id=b.id and decision='approved'),'qr_prepared',exists(select 1 from public.fs_payment_claims pc where pc.payment_request_id=p.id),'items',case when admin then (select coalesce(jsonb_agg(to_jsonb(i)-'reviewed_by'),'[]') from rc33_demo.items i where i.batch_id=b.id) else '[]'::jsonb end) order by b.submitted_at) from rc33_demo.batches b join rc33_demo.cycles c on c.id=b.cycle_id left join rc3_demo.applications a on a.id=b.aggregate_id left join rc3_demo.financial_links f on f.application_id=a.id left join public.fs_payment_requests p on p.id=f.payment_request_id where c.parish=p_parish and c.service_year=p_year and (admin or b.status='reviewed')),'[]'));
end $function$
;
CREATE FUNCTION rc33_demo.core_cycle_detail(p_parish text, p_year integer, p_full boolean, p_finance boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb;c uuid;admin boolean;
begin
 s:=rc33_demo.core_snapshot(p_parish,p_year,p_full,p_finance);c:=(s->>'cycle')::uuid;admin:=coalesce((s->'roles'->>'admin')::boolean,false);
 return s||jsonb_build_object('drafts',case when admin then coalesce((select jsonb_agg(to_jsonb(d)-'created_by' order by updated_at desc) from rc33_demo.drafts d where d.cycle_id=c and d.state='draft' and not(d.kind='original' and d.replace_batch is null and exists(select 1 from rc33_demo.batches b where b.cycle_id=c and b.ministry=d.ministry and b.kind='original'))),'[]') else '[]'::jsonb end,
 'history',case when admin then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'batch_id',e.batch_id,'action',e.action,'at',e.at) order by e.id desc) from rc33_demo.events e where cycle_id=c),'[]') else '[]'::jsonb end);
end $function$
;
CREATE FUNCTION rc33_demo.core_advance_list(p_parish text, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_parish is null or p_parish not in ('RC33 Sample Parish A','RC33 Sample Parish B') or p_year is null or p_year not between 2026 and 2031 then raise exception 'Unknown fictional cycle';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',ad.id,'ministry',ad.ministry,'amount_centavos',ad.amount_centavos,'declared_count',ad.declared_count,'allocated_application',ad.allocated_application,'discrepancy_note',ad.discrepancy_note,'payment_reference',p.payment_reference,'receipt_recorded',exists(select 1 from public.fs_receipt_issues ri where ri.collection_id=ad.collection_id),'collection_id',ad.collection_id) order by ad.collected_at desc) from rc33_demo.advances ad join rc33_demo.cycles c on c.id=ad.cycle_id join public.fs_payment_requests p on p.id=ad.request_id where c.parish=p_parish and c.service_year=p_year),'[]');
end $function$
;
revoke all on function rc33_demo.core_open_cycle(uuid,text,integer) from public,anon,authenticated;
revoke all on function rc33_demo.core_write_batch(uuid,uuid,text,text,text,text,jsonb,text,boolean,boolean,uuid) from public,anon,authenticated;
revoke all on function rc33_demo.core_open_draft(uuid,uuid,text,text,text,uuid,boolean) from public,anon,authenticated;
revoke all on function rc33_demo.core_save_draft(uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function rc33_demo.core_submit_draft(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function rc33_demo.core_submit_parish_drafts(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function rc33_demo.core_snapshot(text,integer,boolean,boolean),rc33_demo.core_cycle_detail(text,integer,boolean,boolean),rc33_demo.core_advance_list(text,integer) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION rc33_demo.open_cycle(p_parish text, p_year integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform rc32_demo.require_admin();
 return rc33_demo.core_open_cycle(auth.uid(),p_parish,p_year);
end $function$;

CREATE OR REPLACE FUNCTION rc33_demo.write_batch(p_cycle uuid, p_ministry text, p_kind text, p_channel text, p_method text, p_items jsonb, p_letter text, p_confirmed boolean, p_zero boolean, p_replace uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform rc32_demo.require_admin();
 return rc33_demo.core_write_batch(auth.uid(),p_cycle,p_ministry,p_kind,p_channel,p_method,p_items,p_letter,p_confirmed,p_zero,p_replace);
end $function$;

CREATE OR REPLACE FUNCTION rc33_demo.open_draft(p_cycle uuid, p_ministry text, p_kind text, p_channel text, p_replace uuid DEFAULT NULL::uuid, p_takeover boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform rc32_demo.require_admin();
 return rc33_demo.core_open_draft(auth.uid(),p_cycle,p_ministry,p_kind,p_channel,p_replace,p_takeover);
end $function$;

CREATE OR REPLACE FUNCTION rc33_demo.save_draft(p_id uuid, p_revision integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform rc32_demo.require_admin();
 return rc33_demo.core_save_draft(auth.uid(),p_id,p_revision,p_payload);
end $function$;

CREATE OR REPLACE FUNCTION rc33_demo.submit_draft(p_id uuid, p_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform rc32_demo.require_admin();
 return rc33_demo.core_submit_draft(auth.uid(),p_id,p_revision);
end $function$;

CREATE OR REPLACE FUNCTION rc33_demo.submit_parish_drafts(p_cycle uuid, p_drafts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform rc32_demo.require_admin();
 return rc33_demo.core_submit_parish_drafts(auth.uid(),p_cycle,p_drafts);
end $function$;
CREATE OR REPLACE FUNCTION rc33_demo.snapshot(p_parish text, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a boolean:=coalesce((rc3_demo.roles()->>'admin')::boolean,false);f boolean:=coalesce((rc3_demo.roles()->>'finance')::boolean,false);
begin if auth.uid() is null or not(a or f) then raise exception 'Authorized TEST operator required' using errcode='42501';end if;return rc33_demo.core_snapshot(p_parish,p_year,a,f);end $function$;
CREATE OR REPLACE FUNCTION rc33_demo.cycle_detail(p_parish text, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a boolean:=coalesce((rc3_demo.roles()->>'admin')::boolean,false);f boolean:=coalesce((rc3_demo.roles()->>'finance')::boolean,false);
begin if auth.uid() is null or not(a or f) then raise exception 'Authorized TEST operator required' using errcode='42501';end if;return rc33_demo.core_cycle_detail(p_parish,p_year,a,f);end $function$;
CREATE OR REPLACE FUNCTION rc33_demo.advance_list(p_parish text, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb:=rc3_demo.roles();
begin if auth.uid() is null or not(coalesce((r->>'admin')::boolean,false) or coalesce((r->>'finance')::boolean,false)) then raise exception 'Authorized TEST staff required' using errcode='42501';end if;return rc33_demo.core_advance_list(p_parish,p_year);end $function$;
-- RC3.4 TEST ONLY: published sample code authenticates fictional coordinators only.
-- No staff JWT impersonation, real accounts, service-role client, or real SMS.
create schema rc34_parish_api;
revoke all on schema rc34_parish_api from public,anon,authenticated;
create table rc34_parish_api.coordinators(
 id uuid primary key default gen_random_uuid(),mobile text unique not null,
 parish text not null check(parish in ('RC33 Sample Parish A','RC33 Sample Parish B')),active boolean not null default true
);
insert into rc34_parish_api.coordinators(mobile,parish,active) values
 ('09000000021','RC33 Sample Parish A',true),('09000000031','RC33 Sample Parish B',true),
 ('09000000032','RC33 Sample Parish A',false),('09000000042','RC33 Sample Parish B',false);
create table rc34_parish_api.sessions(
 token_hash bytea primary key,coordinator_id uuid not null references rc34_parish_api.coordinators(id),
 issued_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz
);
create index rc34_session_issued on rc34_parish_api.sessions(coordinator_id,issued_at);
alter table rc34_parish_api.coordinators enable row level security;
alter table rc34_parish_api.sessions enable row level security;
revoke all on all tables in schema rc34_parish_api from public,anon,authenticated;
create table rc33_demo.qr_intentions(
 application_id uuid primary key references rc3_demo.applications(id),coordinator_id uuid not null references rc34_parish_api.coordinators(id),requested_at timestamptz not null default now()
);
alter table rc33_demo.qr_intentions enable row level security;
revoke all on rc33_demo.qr_intentions from public,anon,authenticated;
create function rc34_parish_api.login(p_mobile text,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c rc34_parish_api.coordinators%rowtype;t text;
begin
 if p_code is distinct from '246810' then raise exception 'Invalid sample verification' using errcode='42501';end if;
 select * into c from rc34_parish_api.coordinators where mobile=p_mobile and active for update;
 if not found then raise exception 'Invalid sample verification' using errcode='42501';end if;
 if (select count(*) from rc34_parish_api.sessions where coordinator_id=c.id and issued_at>now()-interval '1 hour')>=30 then raise exception 'Sample session limit reached; try later';end if;
 t:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into rc34_parish_api.sessions(token_hash,coordinator_id,expires_at) values(sha256(convert_to(t,'UTF8')),c.id,now()+interval '8 hours');
 return jsonb_build_object('token',t,'parish',c.parish);
end $$;
create function rc34_parish_api.call(p_token text,p_action text,p_args jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c rc34_parish_api.coordinators%rowtype;campaign rc33_demo.renewal_campaign%rowtype;cy uuid;d rc33_demo.drafts%rowtype;bid uuid;v jsonb;s jsonb;v_application uuid;
begin
 if p_token is null or p_token!~'^[0-9a-f]{64}$' or p_action is null or p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>160000 then raise exception 'Invalid coordinator session or request' using errcode='42501';end if;
 select co.* into c from rc34_parish_api.sessions se join rc34_parish_api.coordinators co on co.id=se.coordinator_id where se.token_hash=sha256(convert_to(p_token,'UTF8')) and se.revoked_at is null and se.expires_at>now() and co.active for share of co,se;
 if not found then raise exception 'Coordinator session expired; sign in again' using errcode='42501';end if;
 if p_action='logout' then update rc34_parish_api.sessions set revoked_at=now() where token_hash=sha256(convert_to(p_token,'UTF8'));return '{}'::jsonb;end if;
 select * into strict campaign from rc33_demo.renewal_campaign where singleton for share;
 if p_action='campaign' then return jsonb_build_object('service_year',campaign.service_year,'intake_open',campaign.intake_open);end if;
 if p_args ? 'p_parish' and p_args->>'p_parish' is distinct from c.parish then raise exception 'Outside authorized parish' using errcode='42501';end if;
 if p_args ? 'p_year' and (p_args->>'p_year')::int is distinct from campaign.service_year then raise exception 'Outside authorized cycle' using errcode='42501';end if;
 select cc.id into cy from rc33_demo.cycles cc where cc.parish=c.parish and cc.service_year=campaign.service_year;
 if p_action='open_cycle' then return to_jsonb(rc33_demo.core_open_cycle(c.id,c.parish,campaign.service_year));end if;
 if p_action='snapshot' then
  s:=rc33_demo.core_cycle_detail(c.parish,campaign.service_year,true,false);
  -- Only parish-owned information; do not expose staff permissions or internal collection IDs.
  s:=jsonb_set(s,'{roles}',jsonb_build_object('admin',false,'finance',false,'coordinator',true));
  s:=jsonb_set(s,'{drafts}',coalesce((select jsonb_agg(case when x->>'channel'='walk_in' then x-'payload'||jsonb_build_object('payload','{}'::jsonb) else x end) from jsonb_array_elements(s->'drafts') x),'[]'::jsonb));
  s:=jsonb_set(s,'{batches}',coalesce((select jsonb_agg(x||jsonb_build_object('qr_requested',exists(select 1 from rc33_demo.qr_intentions qi where qi.application_id=(x->>'aggregate_id')::uuid))) from jsonb_array_elements(s->'batches') x),'[]'::jsonb));
  return s;
 end if;
 if p_action='advances' then return coalesce((select jsonb_agg(x-'collection_id') from jsonb_array_elements(rc33_demo.core_advance_list(c.parish,campaign.service_year)) x),'[]');end if;
 if cy is null then raise exception 'Open the authorized parish cycle first';end if;
 if p_action='open_draft' then
  if (p_args->>'p_cycle')::uuid is distinct from cy or p_args->>'p_channel' is distinct from 'online_rehearsal' or coalesce((p_args->>'p_takeover')::boolean,false) then raise exception 'Outside coordinator intake scope' using errcode='42501';end if;
  return rc33_demo.core_open_draft(c.id,cy,p_args->>'p_ministry',p_args->>'p_kind','online_rehearsal',(p_args->>'p_replace')::uuid,false);
 elsif p_action in ('save_draft','submit_draft') then
  -- Match the cycle and channel again on every request, independent of client input.
  select * into d from rc33_demo.drafts where rc33_demo.drafts.id=(p_args->>'p_id')::uuid and cycle_id=cy and channel='online_rehearsal';
  if not found then raise exception 'Draft outside authorized parish' using errcode='42501';end if;
  if p_action='save_draft' then return rc33_demo.core_save_draft(c.id,d.id,(p_args->>'p_revision')::int,p_args->'p_payload');end if;
  if not coalesce((d.payload->>'roster_confirmed')::boolean,false) or not coalesce((d.payload->>'letter_confirmed')::boolean,false) then raise exception 'Confirm roster and recommendation first';end if;
  return to_jsonb(rc33_demo.core_submit_draft(c.id,d.id,(p_args->>'p_revision')::int));
 elsif p_action='submit_parish' then
  if (p_args->>'p_cycle')::uuid is distinct from cy then raise exception 'Outside authorized parish' using errcode='42501';end if;
  return rc33_demo.core_submit_parish_drafts(c.id,cy,p_args->'p_drafts');
 elsif p_action='request_qr' then
  v_application:=(p_args->>'p_application_id')::uuid;
  if not exists(select 1 from rc3_demo.applications a join rc33_demo.batches b on b.aggregate_id=a.id where a.id=v_application and b.cycle_id=cy and a.status='awaiting_payment' and a.preferred_payment_method='QR') or exists(select 1 from rc33_demo.batches b where b.aggregate_id=v_application and b.cycle_id<>cy) then raise exception 'No payable QR obligation in this parish' using errcode='42501';end if;
  insert into rc33_demo.qr_intentions(application_id,coordinator_id) values(v_application,c.id) on conflict(application_id) do nothing;
  if found then insert into rc33_demo.events(cycle_id,actor,action,details) values(cy,c.id,'qr_evidence_requested',jsonb_build_object('application',v_application));end if;
  return '{}'::jsonb;
 end if;
 raise exception 'Unsupported coordinator action' using errcode='42501';
end $$;
create function public.rc34_demo_parish_login(p_mobile text,p_code text) returns jsonb language sql security invoker set search_path='' as $$select rc34_parish_api.login(p_mobile,p_code)$$;
create function public.rc34_demo_parish_call(p_token text,p_action text,p_args jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select rc34_parish_api.call(p_token,p_action,p_args)$$;
revoke all on all functions in schema rc34_parish_api from public,anon,authenticated;
revoke all on function public.rc34_demo_parish_login(text,text),public.rc34_demo_parish_call(text,text,jsonb) from public,anon,authenticated;
grant usage on schema rc34_parish_api to anon,authenticated;
grant execute on function rc34_parish_api.login(text,text),rc34_parish_api.call(text,text,jsonb),public.rc34_demo_parish_login(text,text),public.rc34_demo_parish_call(text,text,jsonb) to anon,authenticated;
-- Staff sees requests in the existing queue; only Registry can prepare the sample bank evidence.
create or replace function rc33_demo.cycle_detail(p_parish text,p_year integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a boolean:=coalesce((rc3_demo.roles()->>'admin')::boolean,false);f boolean:=coalesce((rc3_demo.roles()->>'finance')::boolean,false);s jsonb;
begin if auth.uid() is null or not(a or f) then raise exception 'Authorized TEST staff required' using errcode='42501';end if;
 s:=rc33_demo.core_cycle_detail(p_parish,p_year,a,f);
 return jsonb_set(s,'{batches}',coalesce((select jsonb_agg(x||jsonb_build_object('qr_requested',exists(select 1 from rc33_demo.qr_intentions qi where qi.application_id=(x->>'aggregate_id')::uuid))) from jsonb_array_elements(s->'batches') x),'[]'::jsonb));
end $$;
