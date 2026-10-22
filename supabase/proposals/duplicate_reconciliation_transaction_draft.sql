-- DRAFT ONLY. NOT APPLIED. Security-reviewed staging rehearsal required.
-- Transactional, fail-closed gate for removing a genuinely empty, erroneous profile.
-- Profiles with documents, meaningful audit/history or any dependent references are NOT eligible.
-- This function has no public EXECUTE grant, so the UI cannot invoke it.
create table if not exists public.member_duplicate_reconciliation_audit (
 id uuid primary key default gen_random_uuid(),
 kept_member_id uuid not null,
 kept_uid text not null,
 removed_member_id uuid not null,
 removed_uid text not null,
 authorized_by uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) >= 20),
 snapshot jsonb not null,
 reconciled_at timestamptz not null default now(),
 check(kept_member_id <> removed_member_id)
);
alter table public.member_duplicate_reconciliation_audit enable row level security;
revoke all on public.member_duplicate_reconciliation_audit from anon, authenticated;
-- SECURITY INVOKER: never bypass row security for public callers.
create or replace function public.reconcile_empty_duplicate_draft(
 p_keep uuid, p_remove uuid, p_remove_uid text, p_reason text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  k public.members%rowtype;
  d public.members%rowtype;
  n integer;
  reconciliation_id uuid;
begin
  -- Locked down from API: this draft is for a controlled staging transaction only.
  if current_user <> 'postgres' then raise exception 'Not available from application'; end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'Two distinct records required'; end if;
  if length(btrim(coalesce(p_reason,''))) < 20 then raise exception 'Explain duplicate removal'; end if;
  select * into k from public.members where id = p_keep for update;
  select * into d from public.members where id = p_remove for update;
  if k.id is null or d.id is null then raise exception 'Record not found'; end if;
  if d.uid <> p_remove_uid then raise exception 'Duplicate UID changed'; end if;
  if lower(btrim(k.first_name)) <> lower(btrim(d.first_name))
   or lower(btrim(k.last_name)) <> lower(btrim(d.last_name))
   or k.parish <> d.parish then raise exception 'Identity/parish mismatch'; end if;
  if k.status not in ('New','Renewed') then raise exception 'Retained record must be validated'; end if;
  if d.status = 'Renewed' or d.expiration_date is not null or d.document_url is not null
    or jsonb_array_length(coalesce(to_jsonb(d.archived_documents),'[]'::jsonb)) > 0
  then raise exception 'Duplicate profile has renewal or document evidence'; end if;
  select count(*) into n from public.member_ministries
    where member_id=d.id and (status <> 'Pending Verification' or document_url is not null
      or renewal_date is not null or expiration_date is not null
      or jsonb_array_length(coalesce(to_jsonb(archived_documents),'[]'::jsonb)) > 0);
  if n > 0 then raise exception 'Duplicate has meaningful ministry assignment history'; end if;
  -- Regardless of cascade action, any linked evidence blocks deletion.
  if exists(select 1 from public.certificate_downloads where member_id=d.id)
    or exists(select 1 from public.recommendation_renewal_memberships where member_id=d.id
      or member_ministry_id in (select id from public.member_ministries where member_id=d.id))
    or exists(select 1 from public.name_correction_requests where member_id=d.id)
    or exists(select 1 from public.public_reports where member_id=d.id)
    or exists(select 1 from public.duplicate_flags where existing_member_id=d.id)
    or exists(select 1 from public.audit_logs where member_id=d.id and admin_action not in ('INSERT'))
  then raise exception 'Linked evidence requires preservation review'; end if;
  -- Even an original INSERT audit is retained separately. No storage object is deleted.
  insert into public.member_duplicate_reconciliation_audit
    (kept_member_id,kept_uid,removed_member_id,removed_uid,authorized_by,reason,snapshot)
    values(k.id,k.uid,d.id,d.uid,(select auth.uid()),p_reason,
      jsonb_build_object('removed_member',to_jsonb(d),'kept_member',to_jsonb(k),
        'removed_ministries',(select coalesce(jsonb_agg(to_jsonb(mm)),'[]'::jsonb)
           from public.member_ministries mm where mm.member_id=d.id)))
    returning id into reconciliation_id;
  -- Intentionally no DELETE statement: an approval-reviewed execution function will
  -- additionally require retention rules for audits and staged/reversible testing.
  return reconciliation_id;
end; $$;
revoke all on function public.reconcile_empty_duplicate_draft(uuid,uuid,text,text)
  from public, anon, authenticated;
-- Do not deploy this file to production: the function is a scaffold, not a deletion feature.
