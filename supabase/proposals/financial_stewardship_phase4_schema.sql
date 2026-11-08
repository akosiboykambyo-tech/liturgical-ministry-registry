-- PHASE 4 SCHEMA PROPOSAL ONLY. NEVER APPLY TO THE LIVE OR TEST DATABASE AS-IS.
-- Depends on auth.users, public.member_ministries, public.recommendation_renewal_batches.
-- Do NOT run older supabase/proposals/parish_ministry_renewal_finance.sql alongside this:
-- both describe a future financial module and require a deliberate migration map.
--
-- Naming: fs_* separates proposed stewardship tables from production registry tables.
-- Amounts: PHP centavos (bigint); official receipt serials: TEXT (leading zeros).
-- Default security: RLS on each table, no anon/authenticated grants or policies.
-- This file DOES NOT create bank accounts, storage buckets, authorized users, or data.

-- -----------------------------------------------------------------------
-- 1. Canonical lookup / authorization. Seed from lib/constants.ts only
-- after verifying canonical spelling and legacy parish/minister assignments.
-- -----------------------------------------------------------------------
create table public.fs_parishes (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique check (length(btrim(canonical_name)) between 3 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.fs_ministries (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique check (length(btrim(canonical_name)) between 3 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.fs_staff_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  role_code text not null check (role_code in (
    'cowl_registry_reviewer','cowl_finance_verifier','cowl_receipt_issuer',
    'cowl_remittance_preparer','curia_receipt_custodian',
    'curia_treasury_reviewer','platform_provisioner')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  check (expires_at is null or expires_at > granted_at),
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index fs_staff_grants_current_uq
  on public.fs_staff_grants(user_id,role_code) where revoked_at is null;

create table public.fs_parish_contacts (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null references public.fs_parishes(id),
  user_id uuid not null references auth.users(id),
  contact_slot smallint not null check (contact_slot in (1,2)),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  check (expires_at is null or expires_at > approved_at),
  check ((revoked_at is null) = (revoked_by is null))
);
-- Two current slots per parish. Expired assignments occupy their slot
-- until trusted staff explicitly revoke/replace them.
create unique index fs_parish_contact_active_slot_uq
  on public.fs_parish_contacts(parish_id,contact_slot) where revoked_at is null;
create unique index fs_parish_contact_active_user_uq
  on public.fs_parish_contacts(parish_id,user_id) where revoked_at is null;

-- -----------------------------------------------------------------------
-- 2. Coordinator submission and registry review.
-- Never directly write existing members/member_ministries in this proposal.
-- -----------------------------------------------------------------------
create table public.fs_renewal_batches (
  id uuid primary key default gen_random_uuid(),
  renewal_reference text not null unique check (length(btrim(renewal_reference)) between 7 and 64),
  parish_id uuid not null references public.fs_parishes(id),
  ministry_id uuid not null references public.fs_ministries(id),
  service_year integer not null check (service_year between 2000 and 2100),
  kind text not null default 'original' check (kind in ('original','supplemental')),
  parent_batch_id uuid references public.fs_renewal_batches(id),
  origin text not null check (origin in ('staff','parish_self_service')),
  submitted_by uuid references auth.users(id),
  status text not null default 'draft'
    check (status in ('draft','submitted','under_review','changes_requested','approved','rejected','cancelled')),
  due_date date,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  legacy_renewal_batch_id uuid references public.recommendation_renewal_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind='original' and parent_batch_id is null)
    or (kind='supplemental' and parent_batch_id is not null)),
  check (status <> 'approved' or (reviewed_at is not null and reviewed_by is not null)),
  check (origin <> 'parish_self_service' or submitted_by is not null)
);
create unique index fs_one_original_batch_per_scope_uq
  on public.fs_renewal_batches(parish_id,ministry_id,service_year) where kind='original';
create index fs_renewal_batches_scope_idx
  on public.fs_renewal_batches(parish_id,ministry_id,service_year,status);

create table public.fs_batch_members (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.fs_renewal_batches(id),
  member_ministry_id uuid not null references public.member_ministries(id),
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','on_hold','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  added_at timestamptz not null default now(),
  unique (batch_id,member_ministry_id),
  unique (id,batch_id),
  check (review_status <> 'approved' or reviewed_by is not null)
);
-- Trusted roster matching must confirm the selected member_ministry belongs to
-- the same parish/ministry as its batch. UUID FKs alone cannot assert that.

create table public.fs_roster_change_requests (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.fs_renewal_batches(id),
  member_ministry_id uuid not null references public.member_ministries(id),
  request_kind text not null check (request_kind in ('request_inactive','member_correction')),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  requested_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  check (status not in ('approved','declined') or
    (reviewed_by is not null and reviewed_at is not null and reviewed_by <> requested_by))
);

create table public.fs_submission_documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.fs_renewal_batches(id),
  document_kind text not null check (document_kind in
    ('recommendation_letter','roster','supporting_document','payment_evidence')),
  storage_bucket text not null default 'fs-private',
  storage_path text not null unique check (length(storage_path) between 10 and 800),
  document_group_id uuid not null default gen_random_uuid(),
  version integer not null default 1 check (version > 0),
  original_name text check (length(original_name) <= 255),
  mime_type text,
  file_bytes bigint check (file_bytes between 1 and 26214400),
  content_sha256 text check (content_sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid not null references auth.users(id),
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','rejected')),
  review_status text not null default 'received'
    check (review_status in ('received','accepted','needs_replacement','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id,document_kind,document_group_id,version),
  check (review_status <> 'accepted' or (scan_status='clean' and reviewed_by is not null))
);
-- Each logical file has its own document_group_id. Multiple independent
-- payment screenshot uploads may coexist in the same renewal batch; revised
-- versions reuse the group id with an incremented version.
-- This is metadata only: Supabase Storage bucket and object RLS require a
-- separately reviewed, private, parish-scoped storage deployment.

-- -----------------------------------------------------------------------
-- 3. Approved fee rules, QR Ph account and payer-initiated claims.
-- Quotes, screenshots and verification are separate records.
-- -----------------------------------------------------------------------
create table public.fs_fee_schedules (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.fs_ministries(id),
  service_year integer not null check (service_year between 2000 and 2100),
  version integer not null check (version > 0),
  rate_centavos bigint not null check (rate_centavos >= 0),
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(ministry_id,service_year,version),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);
create unique index fs_one_approved_rate_per_scope_uq
  on public.fs_fee_schedules(ministry_id,service_year) where status='approved';

create table public.fs_receiving_accounts (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null unique,
  beneficiary_name text not null,
  institution_name text not null,
  provider_name text not null,
  account_fingerprint text not null unique,
  qr_storage_path text,
  purpose text not null default 'cowl_collections'
    check (purpose='cowl_collections'),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','retired')),
  authorized_by uuid references auth.users(id),
  authorized_at timestamptz,
  effective_from date,
  effective_until date,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or (authorized_by is not null and authorized_at is not null)),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);
-- The lawful beneficiary may be a Curia-approved diocesan organization;
-- purpose indicates the account is designated for COWL collections.
-- Actual bank account number/credentials must not be exposed in this table.

create table public.fs_payment_requests (
  id uuid primary key default gen_random_uuid(),
  payment_reference text not null unique,
  batch_id uuid not null references public.fs_renewal_batches(id),
  quote_version integer not null default 1 check (quote_version > 0),
  fee_schedule_id uuid not null references public.fs_fee_schedules(id),
  quoted_participants integer not null check (quoted_participants >= 0),
  adjustment_centavos bigint not null default 0,
  total_due_centavos bigint not null check (total_due_centavos >= 0),
  due_date date,
  status text not null default 'quoted'
    check (status in ('quoted','awaiting_payment','part_paid','paid','cancelled')),
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  unique(batch_id,quote_version),
  check (total_due_centavos >= 0)
);
-- The approved fee, quoted roster count, adjustments and resulting balance
-- must be checked transactionally; do NOT let a client set status='paid'.

create table public.fs_payment_claims (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references public.fs_payment_requests(id),
  receiving_account_id uuid not null references public.fs_receiving_accounts(id),
  payment_channel text not null default 'qr_ph' check (payment_channel='qr_ph'),
  provider_name text not null,
  submitted_external_reference text not null check (length(btrim(submitted_external_reference)) between 5 and 180),
  normalized_external_reference text generated always as
    (upper(regexp_replace(submitted_external_reference, '[^a-zA-Z0-9]', '', 'g'))) stored,
  claimed_amount_centavos bigint not null check (claimed_amount_centavos > 0),
  claimed_paid_at timestamptz not null,
  proof_document_id uuid not null unique references public.fs_submission_documents(id),
  submitted_by uuid not null references auth.users(id),
  status text not null default 'submitted'
    check (status in ('submitted','under_review','duplicate_flagged','needs_clarification','verified','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(normalized_external_reference) >= 5),
  check (status <> 'verified' or (reviewed_by is not null and reviewed_at is not null))
);
-- Enforce one active claim per account/provider/reference; a repeated
-- screenshot/reference can be held as duplicate_flagged without claiming Paid.
-- Staff must consider legitimate reference reuse by providers when verifying.
create unique index fs_active_payment_claim_ref_uq
  on public.fs_payment_claims(receiving_account_id,provider_name,normalized_external_reference)
  where status in ('submitted','under_review','verified');
create index fs_payment_claims_queue_idx on public.fs_payment_claims(status,created_at);

create table public.fs_bank_credits (
  id uuid primary key default gen_random_uuid(),
  receiving_account_id uuid not null references public.fs_receiving_accounts(id),
  provider_name text not null,
  bank_external_reference text not null,
  normalized_external_reference text generated always as
    (upper(regexp_replace(bank_external_reference, '[^a-zA-Z0-9]', '', 'g'))) stored,
  amount_centavos bigint not null check (amount_centavos > 0),
  credited_at timestamptz not null,
  statement_batch_reference text,
  bank_evidence_path text,
  recorded_by uuid not null references auth.users(id),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (length(normalized_external_reference) >= 5),
  unique(receiving_account_id,provider_name,normalized_external_reference)
);
-- Statement imports must use bank-authenticated records / restricted reviewer
-- verification; never copy an applicant screenshot into this authoritative table.

create table public.fs_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.fs_payment_claims(id),
  bank_credit_id uuid unique references public.fs_bank_credits(id),
  decision text not null check (decision in ('verified','discrepancy','rejected')),
  verified_amount_centavos bigint check (verified_amount_centavos >= 0),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  reason text,
  check (decision <> 'verified' or
    (bank_credit_id is not null and verified_amount_centavos is not null)),
  check (decision <> 'discrepancy' or length(btrim(coalesce(reason,''))) >= 10)
);

-- -----------------------------------------------------------------------
-- 4. Verified collections, allocations, physical receipt stock and issuance.
-- -----------------------------------------------------------------------
create table public.fs_collections (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique,
  payment_request_id uuid not null references public.fs_payment_requests(id),
  collection_channel text not null check (collection_channel in ('qr_ph','otc')),
  amount_centavos bigint not null check (amount_centavos > 0),
  payment_claim_id uuid unique references public.fs_payment_claims(id),
  bank_credit_id uuid unique references public.fs_bank_credits(id),
  status text not null default 'posted' check (status in ('posted','reversed')),
  received_by uuid not null references auth.users(id),
  received_at timestamptz not null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  check (
    (collection_channel='qr_ph' and payment_claim_id is not null and bank_credit_id is not null) or
    (collection_channel='otc' and payment_claim_id is null and bank_credit_id is null)),
  check (status <> 'reversed' or length(btrim(coalesce(reversal_reason,''))) >= 10)
);
-- A trusted atomic command must ensure QR claims are verified, their credit
-- matches the collection amount/account and the credit is not reused.

create table public.fs_collection_allocations (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.fs_collections(id),
  batch_member_id uuid not null references public.fs_batch_members(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  unique(collection_id,batch_member_id)
);
-- Atomic posting must enforce allocations sum to collection amount and every
-- allocated member belongs to the same approved payment obligation.

create table public.fs_receipt_series (
  id uuid primary key default gen_random_uuid(),
  issuing_entity text not null,
  series_code text not null,
  approved_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(issuing_entity,series_code)
);

create table public.fs_receipt_booklets (
  id uuid primary key default gen_random_uuid(),
  booklet_reference text not null unique,
  series_id uuid not null references public.fs_receipt_series(id),
  first_printed_no text not null,
  last_printed_no text not null,
  custody_state text not null default 'curia_stock'
    check (custody_state in ('curia_stock','awaiting_cowl_ack','cowl_custody','returned')),
  registered_by uuid not null references auth.users(id),
  registered_at timestamptz not null default now(),
  assigned_to uuid references auth.users(id),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  unique(id,series_id),
  check (first_printed_no ~ '^[0-9]{4,12}$' and last_printed_no ~ '^[0-9]{4,12}$'),
  check (length(first_printed_no)=length(last_printed_no)),
  check ((last_printed_no::numeric-first_printed_no::numeric) between 0 and 499),
  check (custody_state <> 'cowl_custody' or
    (assigned_to is not null and acknowledged_by is not null and acknowledged_at is not null))
);

create table public.fs_receipt_numbers (
  id uuid primary key default gen_random_uuid(),
  booklet_id uuid not null,
  series_id uuid not null,
  printed_no text not null check (printed_no ~ '^[0-9]{4,12}$'),
  status text not null default 'available'
    check (status in ('available','issued','voided','missing','returned')),
  created_at timestamptz not null default now(),
  foreign key (booklet_id,series_id) references public.fs_receipt_booklets(id,series_id),
  unique (series_id,printed_no),
  unique (booklet_id,printed_no)
);
-- Stock registration must atomically enumerate the actual printed range,
-- check for overlap (including concurrent booklet registrations), and assign
-- every number exactly once. This table prevents duplicate series+numbers,
-- but a booklet start/end interval alone does not prevent overlap.

create table public.fs_receipt_custody_events (
  id uuid primary key default gen_random_uuid(),
  booklet_id uuid not null references public.fs_receipt_booklets(id),
  event_kind text not null check (event_kind in
    ('registered','assigned','acknowledged','returned','exception_reported')),
  actor_id uuid not null references auth.users(id),
  recipient_id uuid references auth.users(id),
  event_at timestamptz not null default now(),
  notes text,
  evidence_path text
);
create table public.fs_receipt_issues (
  id uuid primary key default gen_random_uuid(),
  receipt_number_id uuid not null unique references public.fs_receipt_numbers(id),
  collection_id uuid not null unique references public.fs_collections(id),
  issue_date date not null,
  payer_written_name text,
  ministry_written_name text,
  printed_accounting_code text,
  amount_centavos bigint not null check (amount_centavos > 0),
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now()
);
-- A single issue may have multiple paper line items: their sum and the issue
-- amount must match the authorized collection, verified in the same transaction.
create table public.fs_receipt_issue_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_issue_id uuid not null references public.fs_receipt_issues(id),
  description text not null,
  participant_count integer check (participant_count > 0),
  fee_centavos bigint check (fee_centavos >= 0),
  amount_centavos bigint not null check (amount_centavos > 0),
  line_no integer not null check (line_no > 0),
  unique(receipt_issue_id,line_no)
);

-- -----------------------------------------------------------------------
-- 5. COWL remittance and independent Curia acknowledgment.
-- -----------------------------------------------------------------------
create table public.fs_remittances (
  id uuid primary key default gen_random_uuid(),
  remittance_reference text not null unique,
  declared_amount_centavos bigint not null check (declared_amount_centavos > 0),
  status text not null default 'draft'
    check (status in ('draft','submitted','curia_confirmed','discrepancy','cancelled')),
  prepared_by uuid not null references auth.users(id),
  submitted_at timestamptz,
  cowl_to_curia_transfer_reference text,
  cowl_to_curia_transferred_at timestamptz,
  created_at timestamptz not null default now(),
  check (status not in ('submitted','curia_confirmed') or submitted_at is not null)
);
create table public.fs_remittance_items (
  remittance_id uuid not null references public.fs_remittances(id),
  collection_id uuid not null unique references public.fs_collections(id),
  receipt_issue_id uuid not null unique references public.fs_receipt_issues(id),
  primary key (remittance_id,collection_id),
  unique(remittance_id,receipt_issue_id)
);
-- Verify in a trusted operation that receipt_issue.collection_id = collection_id
-- and that sum(posted collection amounts) = declared_amount_centavos.

create table public.fs_duplicate_copy_handoffs (
  id uuid primary key default gen_random_uuid(),
  remittance_id uuid not null,
  receipt_issue_id uuid not null,
  status text not null default 'with_cowl'
    check (status in ('with_cowl','submitted','curia_verified','missing','disputed')),
  copy_count integer not null default 1 check (copy_count >= 0),
  handed_by uuid references auth.users(id),
  handed_at timestamptz,
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  notes text,
  foreign key (remittance_id,receipt_issue_id)
    references public.fs_remittance_items(remittance_id,receipt_issue_id),
  unique(remittance_id,receipt_issue_id),
  check (status <> 'curia_verified' or (checked_by is not null and checked_at is not null))
);
create table public.fs_curia_reviews (
  id uuid primary key default gen_random_uuid(),
  remittance_id uuid not null unique references public.fs_remittances(id),
  curia_acknowledgment_reference text unique,
  decision text not null check (decision in ('confirmed','discrepancy')),
  counted_amount_centavos bigint not null check (counted_amount_centavos >= 0),
  verified_duplicate_count integer not null check (verified_duplicate_count >= 0),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  discrepancy_notes text,
  check (decision <> 'confirmed' or curia_acknowledgment_reference is not null),
  check (decision <> 'discrepancy' or
    length(btrim(coalesce(discrepancy_notes,''))) >= 10)
);
-- Independent reviewer, counted amount, posted remittance items and all
-- duplicate copies must match before confirmation. This requires an atomic
-- trusted operation; a client cannot directly INSERT reviews.

create table public.fs_audit_events (
  id bigint generated always as identity primary key,
  entity_kind text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users(id),
  happened_at timestamptz not null default now(),
  reason text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object')
);
-- Append-only audit events: avoid PII, full receipt images, bank tokens or
-- raw screenshots in audit JSON; store evidence in private storage.

create index fs_contacts_user_idx on public.fs_parish_contacts(user_id,revoked_at);
create index fs_batches_submitted_by_idx on public.fs_renewal_batches(submitted_by);
create index fs_batch_members_batch_idx on public.fs_batch_members(batch_id);
create index fs_change_requests_queue_idx on public.fs_roster_change_requests(status,created_at);
create index fs_documents_batch_idx on public.fs_submission_documents(batch_id,document_kind);
create index fs_claims_payment_request_idx on public.fs_payment_claims(payment_request_id);
create index fs_bank_credits_account_date_idx on public.fs_bank_credits(receiving_account_id,credited_at);
create index fs_collections_payment_request_idx on public.fs_collections(payment_request_id);
create index fs_receipt_numbers_booklet_idx on public.fs_receipt_numbers(booklet_id,status);
create index fs_receipt_issues_collection_idx on public.fs_receipt_issues(collection_id);
create index fs_remittance_items_remit_idx on public.fs_remittance_items(remittance_id);
create index fs_events_entity_idx on public.fs_audit_events(entity_kind,entity_id,happened_at desc);

-- Fail closed: tables deliberately receive NO anon/authenticated access
-- until security policy draft and trusted transaction operations are reviewed.
-- No grants to anon, authenticated, or PUBLIC.

alter table public.fs_parishes enable row level security;
revoke all on table public.fs_parishes from public, anon, authenticated;
alter table public.fs_ministries enable row level security;
revoke all on table public.fs_ministries from public, anon, authenticated;
alter table public.fs_staff_grants enable row level security;
revoke all on table public.fs_staff_grants from public, anon, authenticated;
alter table public.fs_parish_contacts enable row level security;
revoke all on table public.fs_parish_contacts from public, anon, authenticated;
alter table public.fs_renewal_batches enable row level security;
revoke all on table public.fs_renewal_batches from public, anon, authenticated;
alter table public.fs_batch_members enable row level security;
revoke all on table public.fs_batch_members from public, anon, authenticated;
alter table public.fs_roster_change_requests enable row level security;
revoke all on table public.fs_roster_change_requests from public, anon, authenticated;
alter table public.fs_submission_documents enable row level security;
revoke all on table public.fs_submission_documents from public, anon, authenticated;
alter table public.fs_fee_schedules enable row level security;
revoke all on table public.fs_fee_schedules from public, anon, authenticated;
alter table public.fs_receiving_accounts enable row level security;
revoke all on table public.fs_receiving_accounts from public, anon, authenticated;
alter table public.fs_payment_requests enable row level security;
revoke all on table public.fs_payment_requests from public, anon, authenticated;
alter table public.fs_payment_claims enable row level security;
revoke all on table public.fs_payment_claims from public, anon, authenticated;
alter table public.fs_bank_credits enable row level security;
revoke all on table public.fs_bank_credits from public, anon, authenticated;
alter table public.fs_payment_reconciliations enable row level security;
revoke all on table public.fs_payment_reconciliations from public, anon, authenticated;
alter table public.fs_collections enable row level security;
revoke all on table public.fs_collections from public, anon, authenticated;
alter table public.fs_collection_allocations enable row level security;
revoke all on table public.fs_collection_allocations from public, anon, authenticated;
alter table public.fs_receipt_series enable row level security;
revoke all on table public.fs_receipt_series from public, anon, authenticated;
alter table public.fs_receipt_booklets enable row level security;
revoke all on table public.fs_receipt_booklets from public, anon, authenticated;
alter table public.fs_receipt_numbers enable row level security;
revoke all on table public.fs_receipt_numbers from public, anon, authenticated;
alter table public.fs_receipt_custody_events enable row level security;
revoke all on table public.fs_receipt_custody_events from public, anon, authenticated;
alter table public.fs_receipt_issues enable row level security;
revoke all on table public.fs_receipt_issues from public, anon, authenticated;
alter table public.fs_receipt_issue_lines enable row level security;
revoke all on table public.fs_receipt_issue_lines from public, anon, authenticated;
alter table public.fs_remittances enable row level security;
revoke all on table public.fs_remittances from public, anon, authenticated;
alter table public.fs_remittance_items enable row level security;
revoke all on table public.fs_remittance_items from public, anon, authenticated;
alter table public.fs_duplicate_copy_handoffs enable row level security;
revoke all on table public.fs_duplicate_copy_handoffs from public, anon, authenticated;
alter table public.fs_curia_reviews enable row level security;
revoke all on table public.fs_curia_reviews from public, anon, authenticated;
alter table public.fs_audit_events enable row level security;
revoke all on table public.fs_audit_events from public, anon, authenticated;

-- Security candidate: supabase/proposals/financial_stewardship_phase4_read_policies.sql
-- Do not run either proposal before schema integration and transactional tests.
