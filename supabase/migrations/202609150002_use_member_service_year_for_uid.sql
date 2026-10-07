-- Generate member UIDs from the member's selected service year.
-- Existing UIDs are not changed.
--
-- Example:
-- service_year = 2026 -> LMD-2026-####
-- service_year = 2027 -> LMD-2027-####
--
-- The sequence is independent for each service year.

CREATE OR REPLACE FUNCTION public.generate_member_uid(p_service_year integer)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_next int;
  v_uid text;
BEGIN
  -- Prevent two simultaneous member inserts from generating
  -- the same UID for the same service year.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('member_uid:' || p_service_year::text, 0)
  );

  -- Always continue above the highest existing UID for this
  -- specific service year. Historical gaps are intentionally
  -- left untouched.
  SELECT COALESCE(
    MAX(
      CAST(
        substring(uid FROM '^LMD-[0-9]{4}-([0-9]+)$')
        AS integer
      )
    ),
    0
  ) + 1
  INTO v_next
  FROM public.members
  WHERE uid ~ '^LMD-[0-9]{4}-[0-9]+$'
    AND uid LIKE 'LMD-' || p_service_year || '-%';

  v_uid := 'LMD-' || p_service_year || '-' || LPAD(v_next::text, 4, '0');

  RETURN v_uid;
END;
$function$;


-- Update the INSERT trigger so the UID is generated from
-- the member's explicitly selected service_year.
CREATE OR REPLACE FUNCTION public.assign_member_uid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.uid IS NULL OR NEW.uid = 'PENDING' THEN
    IF NEW.service_year IS NULL THEN
      RAISE EXCEPTION 'service_year is required before generating a member UID';
    END IF;

    NEW.uid := generate_member_uid(NEW.service_year);
  END IF;

  RETURN NEW;
END;
$function$;