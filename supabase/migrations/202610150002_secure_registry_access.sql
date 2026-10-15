
-- Secure registry access
-- Prepared for review; do not execute until the application is ready.

BEGIN;

-- 1. Remove policies exposing protected records directly.
DROP POLICY IF EXISTS "public_read_members"
ON public.members;

DROP POLICY IF EXISTS "Allow public search lookup"
ON public.members;

DROP POLICY IF EXISTS "public_select_member_ministries"
ON public.member_ministries;

DROP POLICY IF EXISTS "public_read_downloads"
ON public.certificate_downloads;

DROP POLICY IF EXISTS "public_insert_downloads"
ON public.certificate_downloads;

DROP POLICY IF EXISTS "public_update_downloads"
ON public.certificate_downloads;

DROP POLICY IF EXISTS "select_scanned_duplicates"
ON public.scanned_duplicates;

DROP POLICY IF EXISTS "admin_full_access_scanned_duplicates"
ON public.scanned_duplicates;

CREATE POLICY "registry_admin_scanned_duplicates"
ON public.scanned_duplicates
FOR ALL
TO authenticated
USING (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
)
WITH CHECK (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
);

-- 2. Remove overly broad ministry modification policies.
DROP POLICY IF EXISTS "admin_insert_member_ministries"
ON public.member_ministries;

DROP POLICY IF EXISTS "admin_update_member_ministries"
ON public.member_ministries;

DROP POLICY IF EXISTS "admin_delete_member_ministries"
ON public.member_ministries;

-- 3. Create administrator-only ministry access.
CREATE POLICY "registry_admin_member_ministries"
ON public.member_ministries
FOR ALL
TO authenticated
USING (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
)
WITH CHECK (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
);

-- 4. Replace email-based authorization on registry tables.
DROP POLICY IF EXISTS "Allow admin full access via email"
ON public.members;

DROP POLICY IF EXISTS "admin_modify_members"
ON public.members;

CREATE POLICY "registry_admin_members"
ON public.members
FOR ALL
TO authenticated
USING (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
)
WITH CHECK (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
);

DROP POLICY IF EXISTS "admin_full_access_downloads"
ON public.certificate_downloads;

CREATE POLICY "registry_admin_certificate_downloads"
ON public.certificate_downloads
FOR ALL
TO authenticated
USING (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
)
WITH CHECK (
  (SELECT auth.uid()) =
  'cde53777-3994-4b99-b1c7-7a7c9b0f0864'::uuid
);

-- 5. Restrict unnecessary direct table privileges.
REVOKE ALL ON TABLE
  public.members,
  public.member_ministries,
  public.certificate_downloads,
  public.audit_logs,
  public.scanned_duplicates
FROM anon, PUBLIC;

REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE
  public.members,
  public.member_ministries,
  public.certificate_downloads,
  public.audit_logs,
  public.scanned_duplicates
FROM authenticated;

-- Preserve member registration and administrative reads/deletes.
GRANT SELECT, INSERT, DELETE ON TABLE
  public.members
TO authenticated;

-- Remove unrestricted member UPDATE privileges.
-- Remove table-level and existing column-level UPDATE grants.
REVOKE UPDATE ON TABLE public.members
FROM authenticated;

REVOKE UPDATE (
  id,
  uid,
  first_name,
  last_name,
  parish,
  ministries,
  status,
  document_url,
  created_at,
  updated_at,
  notes,
  expiration_date,
  archived_documents,
  service_year
) ON TABLE public.members
FROM authenticated;

-- Restrict updates to editable member fields.
GRANT UPDATE (
  first_name,
  last_name,
  parish,
  ministries,
  status,
  document_url,
  created_at,
  updated_at,
  notes,
  expiration_date,
  archived_documents
) ON TABLE public.members
TO authenticated;

-- Preserve other administrator browser operations.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.member_ministries,
  public.certificate_downloads,
  public.audit_logs,
  public.scanned_duplicates
TO authenticated;

-- Preserve server-side API access.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.members,
  public.member_ministries,
  public.certificate_downloads,
  public.audit_logs,
  public.scanned_duplicates
TO service_role;

COMMIT;
