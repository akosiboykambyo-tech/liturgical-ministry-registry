-- DRAFT ONLY. Do not apply until diocesan collection/receipt authority is documented.
-- This migration creates a normalized structure for parish–ministry renewal batches.
-- All new tables use RLS with no client-facing policies initially (deny by default).
-- A reviewed, role-scoped access migration is required before enabling the UI.
create table if not exists public.renewal_batches (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  parish text not null,
  ministry text not null,
  service_year integer not null check (service_year between 2000 and 2100),
  representative_name text not null,
  representative_contact text,
  batch_kind text not null default 'original' check (batch_kind in ('original','supplemental')),
  parent_batch_id uuid references public.renewal_batches(id),
  processing_status text not null default 'received' check (processing_status in ('received','under_review','for_signature','for_archiving','for_validation','completed','on_hold','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((batch_kind = 'original' and parent_batch_id is null) or (batch_kind = 'supplemental' and parent_batch_id is not null))
);
create table if not exists public.renewal_batch_members (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.renewal_batches(id),
  member_ministry_id uuid not null references public.member_ministries(id),
  review_status text not null default 'received' check (review_status in ('received','under_review','approved','on_hold','rejected')),
  document_status text not null default 'awaiting_signed_letter' check (document_status in ('awaiting_signed_letter','for_archiving','archived')),
  document_path text,
  approved_at timestamptz,
  added_at timestamptz not null default now(),
  unique(batch_id, member_ministry_id)
);
create table if not exists public.renewal_collections (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  batch_id uuid not null references public.renewal_batches(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  payment_channel text not null check (payment_channel in ('cash','diocesan_transfer')),
  collection_status text not null default 'draft' check (collection_status in ('draft','collected','voided')),
  payment_document_type text check (payment_document_type in ('treasury_receipt','invoice','supplementary_receipt','internal_acknowledgment')),
  payment_document_number text,
  received_by uuid references auth.users(id),
  received_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now(),
  check (collection_status <> 'collected' or (received_at is not null and received_by is not null))
);
create table if not exists public.renewal_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.renewal_collections(id),
  batch_member_id uuid not null references public.renewal_batch_members(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  unique(collection_id,batch_member_id)
);
-- Payments can span multiple renewal batches only through explicitly linked allocations;
-- a shared parent receipt should not be copied or rewritten on every member.
create table if not exists public.renewal_remittances (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  declared_amount_centavos bigint not null check (declared_amount_centavos >= 0),
  accepted_amount_centavos bigint check (accepted_amount_centavos >= 0),
  status text not null default 'draft' check (status in ('draft','submitted','treasury_confirmed','exception','cancelled')),
  prepared_by uuid not null references auth.users(id),
  confirmed_by uuid references auth.users(id),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  treasury_reference text,
  discrepancy_note text,
  created_at timestamptz not null default now(),
  check (status <> 'treasury_confirmed' or (confirmed_by is not null and confirmed_at is not null and accepted_amount_centavos = declared_amount_centavos and confirmed_by <> prepared_by))
);
create table if not exists public.renewal_remittance_collections (
  remittance_id uuid not null references public.renewal_remittances(id),
  collection_id uuid not null unique references public.renewal_collections(id),
  primary key (remittance_id,collection_id)
);
create table if not exists public.renewal_financial_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  entity_type text not null check (entity_type in ('batch','collection','allocation','remittance','batch_member')),
  entity_id uuid not null,
  action text not null,
  reason text,
  previous_state jsonb,
  new_state jsonb
);
create index if not exists renewal_batch_lookup on public.renewal_batches(parish,ministry,service_year);
create index if not exists renewal_batch_members_ministry on public.renewal_batch_members(member_ministry_id);
create index if not exists renewal_collection_batch on public.renewal_collections(batch_id);
create index if not exists renewal_events_entity on public.renewal_financial_events(entity_type,entity_id,occurred_at desc);
alter table public.renewal_batches enable row level security;
alter table public.renewal_batch_members enable row level security;
alter table public.renewal_collections enable row level security;
alter table public.renewal_payment_allocations enable row level security;
alter table public.renewal_remittances enable row level security;
alter table public.renewal_remittance_collections enable row level security;
alter table public.renewal_financial_events enable row level security;
-- No GRANT or policies here: deny access until a separate security-reviewed migration.
