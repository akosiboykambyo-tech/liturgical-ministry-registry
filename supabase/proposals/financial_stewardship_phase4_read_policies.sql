-- PHASE 4 READ-ONLY RLS POLICY PROPOSAL. DO NOT APPLY TO PRODUCTION.
-- Prerequisite: financial_stewardship_phase4_schema.sql and vetted canonical seeds.
-- This grant/policy layer permits scoped SELECT only. It intentionally does NOT
-- permit any direct INSERT/UPDATE/DELETE for clients or staff. All writes must
-- be built later as authenticated, transactional, audited operations.
--
-- Review exposed schemas, provisioner grants, auth model, contact expiry,
-- guest/anonymous Auth behavior and Storage policies before applying.
--
-- SECURITY DEFINER is required only for minimal boolean lookups into role
-- grants and parish-contact membership. Functions are private-schema,
-- fixed search_path, no dynamic SQL, and EXECUTE revoked from PUBLIC.

create schema if not exists fs_internal;
revoke all on schema fs_internal from public, anon;
grant usage on schema fs_internal to authenticated;

create function fs_internal.has_staff_role(p_role text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.fs_staff_grants g
    where g.user_id = (select auth.uid())
      and g.role_code = p_role
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

create function fs_internal.is_parish_contact(p_parish uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.fs_parish_contacts c
    where c.user_id = (select auth.uid())
      and c.parish_id = p_parish
      and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())
  );
$$;

create function fs_internal.is_any_parish_contact()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.fs_parish_contacts c
    where c.user_id = (select auth.uid())
      and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())
  );
$$;

create function fs_internal.can_read_batch(p_batch uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.fs_renewal_batches b
    where b.id = p_batch and (
      fs_internal.is_parish_contact(b.parish_id)
      or fs_internal.has_staff_role('cowl_registry_reviewer')
      or fs_internal.has_staff_role('cowl_finance_verifier')
    )
  );
$$;

create function fs_internal.can_read_registry_batch(p_batch uuid)
returns boolean language sql stable security definer set search_path = ''
as $
  select exists (
    select 1 from public.fs_renewal_batches b
    where b.id = p_batch and (
      fs_internal.is_parish_contact(b.parish_id)
      or fs_internal.has_staff_role('cowl_registry_reviewer')
    )
  );
$;

create function fs_internal.can_read_document(p_batch uuid, p_kind text)
returns boolean language sql stable security definer set search_path = ''
as $
  select exists (
    select 1 from public.fs_renewal_batches b
    where b.id = p_batch and (
      fs_internal.is_parish_contact(b.parish_id)
      or (p_kind = 'payment_evidence' and fs_internal.has_staff_role('cowl_finance_verifier'))
      or (p_kind <> 'payment_evidence' and fs_internal.has_staff_role('cowl_registry_reviewer'))
    )
  );
$;

create function fs_internal.can_read_payment_request(p_request uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.fs_payment_requests pr
    where pr.id = p_request
      and fs_internal.can_read_batch(pr.batch_id)
  );
$$;

revoke all on function fs_internal.has_staff_role(text) from public, anon;
revoke all on function fs_internal.is_parish_contact(uuid) from public, anon;
revoke all on function fs_internal.is_any_parish_contact() from public, anon;
revoke all on function fs_internal.can_read_batch(uuid) from public, anon;
revoke all on function fs_internal.can_read_registry_batch(uuid) from public, anon;
revoke all on function fs_internal.can_read_document(uuid,text) from public, anon;
revoke all on function fs_internal.can_read_payment_request(uuid) from public, anon;
grant execute on function fs_internal.has_staff_role(text) to authenticated;
grant execute on function fs_internal.is_parish_contact(uuid) to authenticated;
grant execute on function fs_internal.is_any_parish_contact() to authenticated;
grant execute on function fs_internal.can_read_batch(uuid) to authenticated;
grant execute on function fs_internal.can_read_registry_batch(uuid) to authenticated;
grant execute on function fs_internal.can_read_document(uuid,text) to authenticated;
grant execute on function fs_internal.can_read_payment_request(uuid) to authenticated;

-- Explicit per-table SELECT grants below. No write grants are issued.
-- Only users with a trusted, active contact assignment or staff grant pass RLS.
create policy fs_parishes_read on public.fs_parishes
  for select to authenticated using (
    fs_internal.is_parish_contact(id)
    or fs_internal.has_staff_role('cowl_registry_reviewer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('platform_provisioner')
  );
create policy fs_ministries_read on public.fs_ministries
  for select to authenticated using (
    fs_internal.is_any_parish_contact()
    or fs_internal.has_staff_role('cowl_registry_reviewer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('platform_provisioner')
  );
create policy fs_staff_grants_read on public.fs_staff_grants
  for select to authenticated using (
    user_id = (select auth.uid())
    or fs_internal.has_staff_role('platform_provisioner')
  );
create policy fs_contacts_read on public.fs_parish_contacts
  for select to authenticated using (
    user_id = (select auth.uid())
    or fs_internal.has_staff_role('platform_provisioner')
  );
create policy fs_batches_read on public.fs_renewal_batches
  for select to authenticated using (
    fs_internal.can_read_batch(id)
  );
create policy fs_batch_members_read on public.fs_batch_members
  for select to authenticated using (
    fs_internal.can_read_registry_batch(batch_id)
  );
create policy fs_change_requests_read on public.fs_roster_change_requests
  for select to authenticated using (
    fs_internal.can_read_registry_batch(batch_id)
  );
create policy fs_documents_read on public.fs_submission_documents
  for select to authenticated using (
    fs_internal.can_read_document(batch_id,document_kind)
  );
create policy fs_fee_schedules_read on public.fs_fee_schedules
  for select to authenticated using (
    status = 'approved'
      and (fs_internal.is_any_parish_contact()
        or fs_internal.has_staff_role('cowl_registry_reviewer')
        or fs_internal.has_staff_role('cowl_finance_verifier'))
    or fs_internal.has_staff_role('platform_provisioner')
  );
create policy fs_accounts_read on public.fs_receiving_accounts
  for select to authenticated using (
    status='approved' and fs_internal.is_any_parish_contact()
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('platform_provisioner')
  );
create policy fs_payment_requests_read on public.fs_payment_requests
  for select to authenticated using (
    fs_internal.can_read_payment_request(id)
  );
create policy fs_payment_claims_read on public.fs_payment_claims
  for select to authenticated using (
    fs_internal.can_read_payment_request(payment_request_id)
  );
-- Verified bank credits and bank match decisions are staff financial evidence,
-- never readable by parish contacts merely because a claim refers to them.
create policy fs_bank_credits_read on public.fs_bank_credits
  for select to authenticated using (
    fs_internal.has_staff_role('cowl_finance_verifier')
  );
create policy fs_payment_reconciliations_read on public.fs_payment_reconciliations
  for select to authenticated using (
    fs_internal.has_staff_role('cowl_finance_verifier')
  );
create policy fs_collections_read on public.fs_collections
  for select to authenticated using (
    fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
    or fs_internal.has_staff_role('cowl_receipt_issuer')
    or fs_internal.has_staff_role('curia_treasury_reviewer')
  );
create policy fs_allocations_read on public.fs_collection_allocations
  for select to authenticated using (
    fs_internal.has_staff_role('cowl_registry_reviewer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
  );

create policy fs_receipt_series_read on public.fs_receipt_series
  for select to authenticated using (
    fs_internal.has_staff_role('curia_receipt_custodian')
    or fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('cowl_receipt_issuer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
  );
create policy fs_receipt_booklets_read on public.fs_receipt_booklets
  for select to authenticated using (
    fs_internal.has_staff_role('curia_receipt_custodian')
    or fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('cowl_receipt_issuer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
  );
create policy fs_receipt_numbers_read on public.fs_receipt_numbers
  for select to authenticated using (
    fs_internal.has_staff_role('curia_receipt_custodian')
    or fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('cowl_receipt_issuer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
  );
create policy fs_receipt_custody_read on public.fs_receipt_custody_events
  for select to authenticated using (
    fs_internal.has_staff_role('curia_receipt_custodian')
    or fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('cowl_receipt_issuer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
  );
create policy fs_receipt_issues_read on public.fs_receipt_issues
  for select to authenticated using (
    fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('curia_receipt_custodian')
    or fs_internal.has_staff_role('cowl_receipt_issuer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
  );
create policy fs_receipt_lines_read on public.fs_receipt_issue_lines
  for select to authenticated using (
    fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('curia_receipt_custodian')
    or fs_internal.has_staff_role('cowl_receipt_issuer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
  );
create policy fs_remittances_read on public.fs_remittances
  for select to authenticated using (
    fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
  );
create policy fs_remittance_items_read on public.fs_remittance_items
  for select to authenticated using (
    fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
  );
create policy fs_duplicate_copies_read on public.fs_duplicate_copy_handoffs
  for select to authenticated using (
    fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('curia_receipt_custodian')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
  );
create policy fs_curia_reviews_read on public.fs_curia_reviews
  for select to authenticated using (
    fs_internal.has_staff_role('curia_treasury_reviewer')
    or fs_internal.has_staff_role('cowl_remittance_preparer')
    or fs_internal.has_staff_role('cowl_finance_verifier')
  );
-- Audit event bodies are intentionally restricted; a separate curated
-- audit reporting view or server endpoint is required for more roles.
create policy fs_audit_events_read on public.fs_audit_events
  for select to authenticated using (
    fs_internal.has_staff_role('platform_provisioner')
  );

grant select on table public.fs_parishes to authenticated;
grant select on table public.fs_ministries to authenticated;
grant select on table public.fs_staff_grants to authenticated;
grant select on table public.fs_parish_contacts to authenticated;
grant select on table public.fs_renewal_batches to authenticated;
grant select on table public.fs_batch_members to authenticated;
grant select on table public.fs_roster_change_requests to authenticated;
grant select on table public.fs_submission_documents to authenticated;
grant select on table public.fs_fee_schedules to authenticated;
grant select on table public.fs_receiving_accounts to authenticated;
grant select on table public.fs_payment_requests to authenticated;
grant select on table public.fs_payment_claims to authenticated;
grant select on table public.fs_bank_credits to authenticated;
grant select on table public.fs_payment_reconciliations to authenticated;
grant select on table public.fs_collections to authenticated;
grant select on table public.fs_collection_allocations to authenticated;
grant select on table public.fs_receipt_series to authenticated;
grant select on table public.fs_receipt_booklets to authenticated;
grant select on table public.fs_receipt_numbers to authenticated;
grant select on table public.fs_receipt_custody_events to authenticated;
grant select on table public.fs_receipt_issues to authenticated;
grant select on table public.fs_receipt_issue_lines to authenticated;
grant select on table public.fs_remittances to authenticated;
grant select on table public.fs_remittance_items to authenticated;
grant select on table public.fs_duplicate_copy_handoffs to authenticated;
grant select on table public.fs_curia_reviews to authenticated;
grant select on table public.fs_audit_events to authenticated;
-- SECURITY REVIEW REQUIRED BEFORE USE:
-- 1. No writing is permitted by any client or staff role in this proposal.
-- 2. No storage.objects policies are installed; all screenshots/docs stay private.
-- 3. Next phase must add audited, atomic commands with current staff checks
--    and row locks; direct service-role writes without such checks are forbidden.
-- 4. Test under distinct Supabase JWT identities before granting read access.
-- 5. fs_internal must NOT be added to Supabase exposed Data API schemas.
