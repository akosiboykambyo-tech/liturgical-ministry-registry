
-- COWL-DOK Liturgical Ministry Registry
-- Secure certificate issuance counter
--
-- Uses the existing unique index on member_ministry_id.
-- Only the service_role may execute the function.
-- Does not rotate UIDs or reset existing counters.

BEGIN;

CREATE OR REPLACE FUNCTION
  public.allocate_certificate_issuance(
    p_registry_id text,
    p_member_ministry_id uuid
  )
RETURNS TABLE (
  issuance_number integer,
  reprint_suffix text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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
     OR (
       v_expiration_date IS NOT NULL
       AND v_expiration_date <=
           (CURRENT_DATE + 30)
     )
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
$function$;

-- Deny direct execution by public clients.
REVOKE ALL
ON FUNCTION public.allocate_certificate_issuance(
  text, uuid
)
FROM PUBLIC, anon, authenticated;

-- Only the trusted server-side service role may execute.
GRANT EXECUTE
ON FUNCTION public.allocate_certificate_issuance(
  text, uuid
)
TO service_role;

COMMIT;
