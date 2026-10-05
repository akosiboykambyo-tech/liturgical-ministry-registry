-- Introduce per-ministry membership records without removing the legacy
-- members.ministries / members.status / members.expiration_date columns.
-- Compatibility-first: the existing application can continue to run while
-- screens are migrated to member_ministries incrementally.

BEGIN;

CREATE TABLE IF NOT EXISTS public.member_ministries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  ministry text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'Pending Verification'
    CHECK (status IN ('Pending Verification', 'New', 'Renewed', 'Inactive')),
  start_date date,
  expiration_date date,
  renewal_date date,
  document_url text,
  document_uploaded_at timestamptz,
  archived_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_ministries_member_ministry_key UNIQUE (member_id, ministry)
);

CREATE INDEX IF NOT EXISTS idx_member_ministries_member_id
  ON public.member_ministries (member_id);

CREATE INDEX IF NOT EXISTS idx_member_ministries_ministry
  ON public.member_ministries (ministry);

CREATE INDEX IF NOT EXISTS idx_member_ministries_status
  ON public.member_ministries (status);

CREATE INDEX IF NOT EXISTS idx_member_ministries_expiration_date
  ON public.member_ministries (expiration_date)
  WHERE expiration_date IS NOT NULL;

DROP TRIGGER IF EXISTS trg_touch_member_ministries_updated_at
  ON public.member_ministries;

CREATE TRIGGER trg_touch_member_ministries_updated_at
BEFORE UPDATE ON public.member_ministries
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.member_ministries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_member_ministries"
  ON public.member_ministries;

CREATE POLICY "public_select_member_ministries"
ON public.member_ministries
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_member_ministries"
  ON public.member_ministries;

CREATE POLICY "admin_insert_member_ministries"
ON public.member_ministries
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_member_ministries"
  ON public.member_ministries;

CREATE POLICY "admin_update_member_ministries"
ON public.member_ministries
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_member_ministries"
  ON public.member_ministries;

CREATE POLICY "admin_delete_member_ministries"
ON public.member_ministries
FOR DELETE
TO authenticated
USING (true);

-- Backfill one membership row per existing members.ministries value.
-- Legacy member-level validity/document data is copied into each current
-- ministry so behavior remains unchanged immediately after migration.
INSERT INTO public.member_ministries (
  member_id,
  ministry,
  status,
  start_date,
  expiration_date,
  renewal_date,
  document_url,
  document_uploaded_at,
  archived_documents
)
SELECT DISTINCT
  m.id,
  ministry_name,
  m.status,
  m.created_at::date,
  m.expiration_date,
  NULL::date,
  m.document_url,
  NULL::timestamptz,
  m.archived_documents
FROM public.members AS m
CROSS JOIN LATERAL unnest(m.ministries) AS ministry_name
WHERE ministry_name IS NOT NULL
  AND btrim(ministry_name) <> ''
ON CONFLICT (member_id, ministry) DO NOTHING;

-- Add a stable membership reference to certificate download tracking.
ALTER TABLE public.certificate_downloads
ADD COLUMN IF NOT EXISTS member_ministry_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'certificate_downloads_member_ministry_id_fkey'
      AND conrelid = 'public.certificate_downloads'::regclass
  ) THEN
    ALTER TABLE public.certificate_downloads
      ADD CONSTRAINT certificate_downloads_member_ministry_id_fkey
      FOREIGN KEY (member_ministry_id)
      REFERENCES public.member_ministries(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

UPDATE public.certificate_downloads AS cd
SET member_ministry_id = mm.id
FROM public.member_ministries AS mm
WHERE cd.member_ministry_id IS NULL
  AND cd.member_id = mm.member_id
  AND cd.ministry IS NOT NULL
  AND cd.ministry = mm.ministry;

CREATE INDEX IF NOT EXISTS idx_certificate_downloads_member_ministry_id
  ON public.certificate_downloads (member_ministry_id)
  WHERE member_ministry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_downloads_membership
  ON public.certificate_downloads (member_ministry_id)
  WHERE member_ministry_id IS NOT NULL;

COMMIT;
