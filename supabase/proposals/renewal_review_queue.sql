-- PROPOSED migration: additive only. Review admin role provisioning before applying.
-- The review queue is separate from both registration duplicate_flags and actual renewals.
create table if not exists public.renewal_review_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  source_filename text not null check (length(source_filename) between 1 and 255),
  source_position integer not null check (source_position >= 1),
  first_name text not null,
  last_name text not null,
  parish text not null,
  ministry text not null,
  reason text not null check (reason in ('multiple_exact_members','missing_membership','same_name_different_parish','similar_name','duplicate_csv_membership','unmatched')),
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution text check (resolution in ('member_verified','ministry_assignment_verified','registry_record_corrected','csv_row_corrected','duplicate_row','no_action_required','other')),
  resolution_notes text,
  created_by uuid not null references auth.users(id),
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(submission_id,source_position),
  constraint resolved_has_decision check (
    (status='open' and resolution is null and resolution_notes is null and resolved_by is null and resolved_at is null)
    or (status in ('resolved','dismissed') and resolution is not null and length(btrim(coalesce(resolution_notes,''))) >= 10 and resolved_by is not null and resolved_at is not null)
  )
);
create index if not exists renewal_review_status_date_idx on public.renewal_review_items(status,created_at desc);
create index if not exists renewal_review_submission_idx on public.renewal_review_items(submission_id);
alter table public.renewal_review_items enable row level security;
-- Only registry administrators/explicitly delegated reviewers; user_metadata is never accepted.
-- A dedicated admin claim must be provisioned securely in auth.app_metadata by a server administrator.
-- Existing administrators without this claim will be denied, not granted broad authenticated access.
create policy renewal_review_admin_read on public.renewal_review_items for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'registry_role') in ('admin','renewal_reviewer'));
create policy renewal_review_admin_insert on public.renewal_review_items for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'registry_role') in ('admin','renewal_reviewer')
    and created_by = (select auth.uid()) and status='open');
create policy renewal_review_admin_update on public.renewal_review_items for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'registry_role') in ('admin','renewal_reviewer'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'registry_role') in ('admin','renewal_reviewer')
    and resolved_by = (select auth.uid()));
revoke all on public.renewal_review_items from anon;
grant select, insert, update on public.renewal_review_items to authenticated;
-- Do not grant DELETE. Also enforce immutability of staged details on resolution.
create or replace function public.protect_renewal_review_details()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.submission_id,new.source_filename,new.source_position,new.first_name,new.last_name,
      new.parish,new.ministry,new.reason,new.candidates,new.created_by,new.created_at)
     is distinct from
     (old.submission_id,old.source_filename,old.source_position,old.first_name,old.last_name,
      old.parish,old.ministry,old.reason,old.candidates,old.created_by,old.created_at) then
    raise exception 'Staged renewal review details are immutable';
  end if;
  if old.status <> 'open' then
    raise exception 'Resolved renewal reviews are immutable';
  end if;
  if new.status = 'open' then
    raise exception 'Review updates must record a resolution';
  end if;
  return new;
end; $$;
revoke all on function public.protect_renewal_review_details() from public, anon, authenticated;
drop trigger if exists protect_renewal_review_details_trigger on public.renewal_review_items;
create trigger protect_renewal_review_details_trigger before update on public.renewal_review_items
for each row execute function public.protect_renewal_review_details();
-- No release until this has been reviewed and tested in a safe environment.
