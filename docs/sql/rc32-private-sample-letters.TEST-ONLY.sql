-- TEST ONLY: generated fictional recommendation PDFs, private and versioned.
create table rc32_demo.synthetic_documents(
 id uuid primary key default gen_random_uuid(),submission_id uuid not null references rc32_demo.submissions(id),
 ministry text not null references rc32_demo.ministries(name),revision integer not null,
 file_name text not null,received date not null,retain_until date not null,contents bytea not null,
 unique(submission_id,ministry,revision)
);
alter table rc32_demo.synthetic_documents enable row level security;
revoke all on rc32_demo.synthetic_documents from public,anon,authenticated;
create function rc32_demo.sample_pdf(p_lines text[]) returns bytea language plpgsql immutable set search_path='' as $$
declare objects text[]; offsets int[]:=array[]::int[]; pdf text:='%PDF-1.4'||chr(10); kids text:=''; stream text; line text; pages int; p int; j int; i int; xref int; nl text:=chr(10);
begin
 pages:=greatest(1,ceil(coalesce(cardinality(p_lines),0)::numeric/32)::int);
 for p in 1..pages loop kids:=kids||(4+(p-1)*2)::text||' 0 R ';end loop;
 objects:=array['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['||kids||'] /Count '||pages::text||' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for p in 1..pages loop
  stream:='BT /F1 11 Tf 48 790 Td 18 TL'||nl;
  for j in ((p-1)*32+1)..least(p*32,coalesce(cardinality(p_lines),0)) loop
   line:=regexp_replace(coalesce(p_lines[j],''),'[^ -~]','?','g');
   line:=replace(replace(replace(left(line,96),chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   stream:=stream||'('||line||') Tj T*'||nl;
  end loop;
  stream:=stream||'ET'||nl;
  objects:=array_append(objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '||(5+(p-1)*2)::text||' 0 R >>');
  objects:=array_append(objects,'<< /Length '||octet_length(stream)::text||' >>'||nl||'stream'||nl||stream||'endstream');
 end loop;
 for i in 1..cardinality(objects) loop
  offsets:=array_append(offsets,octet_length(pdf));
  pdf:=pdf||i::text||' 0 obj'||nl||objects[i]||nl||'endobj'||nl;
 end loop;
 xref:=octet_length(pdf);pdf:=pdf||'xref'||nl||'0 '||(cardinality(objects)+1)::text||nl||'0000000000 65535 f '||nl;
 foreach i in array offsets loop pdf:=pdf||lpad(i::text,10,'0')||' 00000 n '||nl;end loop;
 pdf:=pdf||'trailer'||nl||'<< /Size '||(cardinality(objects)+1)::text||' /Root 1 0 R >>'||nl||'startxref'||nl||xref::text||nl||'%%EOF'||nl;
 return convert_to(pdf,'UTF8');
end $$;
create function rc32_demo.store_sample_document() returns trigger language plpgsql security definer set search_path='' as $$
declare s rc32_demo.submissions%rowtype; sec jsonb; lines text[]; names text[];
begin
 if new.filename is null then return new;end if;
 select * into strict s from rc32_demo.submissions where id=new.submission_id;
 select x into sec from jsonb_array_elements(s.payload) x where x->>'ministry'=new.ministry;
 lines:=array['COWL-DOK | Liturgical Ministry Registry','DEMONSTRATION ONLY - NOT AN OFFICIAL DOCUMENT','Sample recommendation letter',s.parish,new.ministry,'Service year: '||s.service_year::text,'Submission: '||s.reference,'Revision: '||s.revision::text,'Received: '||new.received::text||' | Retain until: '||new.retain_until::text,'','Recommended fictional assignments:'];
 select coalesce(array_agg(r.first_name||' '||r.last_name||' - '||(i->>'decision') order by r.last_name,r.first_name),array[]::text[]) into names from jsonb_array_elements(sec->'items') i join rc32_demo.roster r on r.assignment_id=(i->>'id')::uuid where i->>'decision'<>'no';
 lines:=lines||names||array['','Additional proposals / correction requests:'];
 select coalesce(array_agg((i->>'first')||' '||(i->>'last')||' - '||(i->>'kind')),array[]::text[]) into names from jsonb_array_elements(sec->'requests') i;
 lines:=lines||names||array['','Generated fictional evidence only. No priest signature or actual uploaded file.'];
 insert into rc32_demo.synthetic_documents(submission_id,ministry,revision,file_name,received,retain_until,contents) values(s.id,new.ministry,s.revision,'SAMPLE-recommendation-'||s.revision::text||'.pdf',new.received,new.retain_until,rc32_demo.sample_pdf(lines));
 return new;
end $$;
create trigger rc32_store_sample_document after insert on rc32_demo.letters for each row execute function rc32_demo.store_sample_document();
create function rc32_demo.read_letter(p_id uuid,p_ministry text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d rc32_demo.synthetic_documents%rowtype;
begin
 perform rc32_demo.require_admin();
 select * into strict d from rc32_demo.synthetic_documents where submission_id=p_id and ministry=p_ministry order by revision desc limit 1;
 return jsonb_build_object('file_name',d.file_name,'base64',encode(d.contents,'base64'),'retain_until',d.retain_until);
end $$;
create function public.rc32_demo_read_letter(p_id uuid,p_ministry text) returns jsonb language sql stable security invoker set search_path='' as $$select rc32_demo.read_letter(p_id,p_ministry)$$;
revoke all on function rc32_demo.sample_pdf(text[]),rc32_demo.store_sample_document(),rc32_demo.read_letter(uuid,text),public.rc32_demo_read_letter(uuid,text) from public,anon,authenticated;
grant execute on function rc32_demo.read_letter(uuid,text),public.rc32_demo_read_letter(uuid,text) to authenticated;
