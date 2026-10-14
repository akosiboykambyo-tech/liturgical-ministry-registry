create table if not exists public.public_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null
    check (report_type in ('record_detail', 'authenticity', 'other')),
  subject text not null,
  details text not null,
  reporter_name text not null,
  reporter_email text not null,
  member_id uuid references public.members(id) on delete set null,
  registry_id text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz
);

create index if not exists public_reports_status_idx
  on public.public_reports (status);

create index if not exists public_reports_created_at_idx
  on public.public_reports (created_at desc);

create index if not exists public_reports_registry_id_idx
  on public.public_reports (registry_id);

alter table public.public_reports enable row level security;

comment on table public.public_reports is
  'Public registry concerns and correction reports. Writes are accepted only through the server-side API using the Supabase service role.';
