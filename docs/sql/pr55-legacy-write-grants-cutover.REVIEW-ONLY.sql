-- PR55 DIRECT-WRITE CUTOVER -- REVIEW ONLY / NEVER RUN WITHOUT RELEASE SIGNOFF.
-- Operator must not remove the guard until ALL gates in the companion runbook PASS:
-- (1) independent restore and Auth+Storage recovery, (2) exact RPC installed,
-- (3) new frontend deployed, (4) real admin & NONadmin JWT regression checks,
-- (5) member CRUD, CSV, verification and letters regression checks,
-- (6) a transactionally verified rollback strategy.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'NO-GO: PR55 direct-write revocation requires explicit release signoff; never apply this review-only file as-is'
    USING ERRCODE='42501';
END
$guard$;

-- This affects only legacy browser-side table mutations. Read grants and
-- active-admin RLS policies remain in place for the existing dashboards.
-- Verified SECURITY DEFINER RPCs still execute as their owner.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.members,
  public.member_ministries,
  public.import_batches,
  public.duplicate_flags
FROM PUBLIC, anon, authenticated;

DO $verify$
BEGIN
  IF has_table_privilege('authenticated','public.members','INSERT') OR
     has_table_privilege('authenticated','public.members','UPDATE') OR
     has_table_privilege('authenticated','public.members','DELETE') OR
     has_table_privilege('authenticated','public.member_ministries','INSERT') OR
     has_table_privilege('authenticated','public.member_ministries','UPDATE') OR
     has_table_privilege('authenticated','public.member_ministries','DELETE') OR
     has_table_privilege('authenticated','public.import_batches','INSERT') OR
     has_table_privilege('authenticated','public.import_batches','UPDATE') OR
     has_table_privilege('authenticated','public.duplicate_flags','INSERT') OR
     NOT has_function_privilege('authenticated',
       'public.registry_admin_member_write_v1(text,jsonb)','EXECUTE') OR
     has_function_privilege('anon',
       'public.registry_admin_member_write_v1(text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'PR55 cutover privilege verification failed';
  END IF;
END
$verify$;
COMMIT;

-- Rollback guidance for an approved future release is separate and must be
-- rehearsed on an isolated clone. Do not blanket-GRANT back to authenticated:
-- that reopens the old direct-write surface and would bypass this cutover.
