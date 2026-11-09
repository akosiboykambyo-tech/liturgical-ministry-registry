-- Phase 4 test-only extension: independent Curia evidence for COWL -> Curia funds.
-- No real funds, account details or sample transactions are inserted.
create table public.fs_curia_fund_receipts (
  id uuid primary key default gen_random_uuid(),
  remittance_id uuid not null unique references public.fs_remittances(id),
  channel text not null check (channel in ('bank_transfer','cash_handover')),
  amount_centavos bigint not null check (amount_centavos >= 0),
  external_transfer_reference text,
  normalized_transfer_reference text generated always as
    (upper(regexp_replace(coalesce(external_transfer_reference,''),'[^a-zA-Z0-9]','','g'))) stored,
  destination_account_fingerprint text,
  verified_receipt_at timestamptz not null,
  curia_evidence_path text,
  received_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  check (channel <> 'bank_transfer' or
    (external_transfer_reference is not null and length(btrim(external_transfer_reference)) >= 5
      and length(normalized_transfer_reference) >= 5
      and destination_account_fingerprint is not null)),
  check (channel <> 'cash_handover' or external_transfer_reference is null)
);
create unique index fs_curia_bank_transfer_reference_uq
  on public.fs_curia_fund_receipts(destination_account_fingerprint,normalized_transfer_reference)
  where channel='bank_transfer';
alter table public.fs_curia_fund_receipts enable row level security;
revoke all on public.fs_curia_fund_receipts from public,anon,authenticated;
create policy fs_curia_fund_receipts_staff_read on public.fs_curia_fund_receipts
 for select to authenticated using (
  fs_internal.has_staff_role('curia_treasury_reviewer')
  or fs_internal.has_staff_role('cowl_remittance_preparer')
 );
grant select on public.fs_curia_fund_receipts to authenticated;
alter table public.fs_curia_reviews
  add column curia_fund_receipt_id uuid unique references public.fs_curia_fund_receipts(id);
alter table public.fs_curia_reviews
  add constraint fs_curia_confirmation_fund_evidence
  check (decision <> 'confirmed' or curia_fund_receipt_id is not null);
-- This is intentionally additive, not a replacement for the COWL bank-credit evidence.
