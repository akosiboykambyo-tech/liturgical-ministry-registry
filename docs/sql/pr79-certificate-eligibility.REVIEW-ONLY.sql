-- NOT EXECUTABLE RELEASE SQL. PR #79 security review only.
-- Captured from live source on November 12, 2026; stop guard prevents accidental use.
-- Publish a versioned migration only after isolated signed-JWT and issuance rehearsal.
BEGIN;
DO $stop$ BEGIN RAISE EXCEPTION 'NO-GO: PR79 certificate proposal is not approved'; END $stop$;
CREATE OR REPLACE FUNCTION public.allocate_certificate_issuance(p_registry_id text, p_member_ministry_id uuid)
 RETURNS TABLE(issuance_number integer, reprint_suffix text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_member_id uuid;
  v_ministry text;
  v_status text;
  v_expiration_date date;
  v_count integer;
BEGIN
  -- Validate input.
  IF p_registry_id IS NULL
     OR length(btrim(p_registry_id)) < 1
     OR length(p_registry_id) > 50
     OR p_member_ministry_id IS NULL
  THEN
    RAISE EXCEPTION 'Invalid certificate request'
      USING ERRCODE = '22023';
  END IF;

  -- Verify that the Registry ID corresponds to
  -- the specified member ministry.
  SELECT
    m.id,
    mm.ministry,
    mm.status,
    mm.expiration_date
  INTO
    v_member_id,
    v_ministry,
    v_status,
    v_expiration_date
  FROM public.members AS m
  JOIN public.member_ministries AS mm
    ON mm.member_id = m.id
  WHERE m.uid = upper(btrim(p_registry_id))
    AND mm.id = p_member_ministry_id;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Certificate record not found'
      USING ERRCODE = '22023';
  END IF;

  -- Match the website's certificate eligibility rules.
  IF v_status NOT IN ('New', 'Renewed')
     OR v_expiration_date IS NULL
     OR v_expiration_date < (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date
  THEN
    RAISE EXCEPTION 'Certificate is not eligible for issuance'
      USING ERRCODE = '22023';
  END IF;

  -- Allocate the next issuance number atomically.
  --
  -- The first successful allocation is number 1.
  -- Subsequent allocations receive numbers 2, 3, etc.
  --
  -- This uses the existing unique partial index
  -- idx_cert_downloads_membership.

  INSERT INTO public.certificate_downloads (
    member_id,
    member_ministry_id,
    ministry,
    download_count,
    created_at,
    updated_at
  )
  VALUES (
    v_member_id,
    p_member_ministry_id,
    v_ministry,
    1,
    now(),
    now()
  )
  ON CONFLICT (member_ministry_id)
    WHERE member_ministry_id IS NOT NULL
  DO UPDATE SET
    download_count =
      public.certificate_downloads.download_count + 1,
    updated_at = now()
  RETURNING download_count INTO v_count;

  RETURN QUERY
  SELECT
    v_count,
    CASE
      WHEN v_count = 1 THEN ''::text
      ELSE '-R' || v_count::text
    END;
END;
$function$

ROLLBACK;
