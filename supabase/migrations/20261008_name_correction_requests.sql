create table if not exists public.name_correction_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  registry_id text not null,
  current_first_name text,
  current_last_name text,
  parish text,
  corrected_name text not null,
  requester_email text not null,
  supporting_details text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'resolved', 'rejected')),
  email_status text not null default 'pending',
  email_provider_id text,
  email_error text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz
);

create index if not exists name_correction_requests_status_idx
  on public.name_correction_requests (status);

create index if not exists name_correction_requests_created_at_idx
  on public.name_correction_requests (created_at desc);

create index if not exists name_correction_requests_registry_id_idx
  on public.name_correction_requests (registry_id);

alter table public.name_correction_requests enable row level security;

comment on table public.name_correction_requests is
  'Publicly submitted registry name-correction requests. Writes are accepted only through the server-side API using the Supabase service role.';
