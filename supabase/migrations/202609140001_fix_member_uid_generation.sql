-- Fix member UID generation.
-- Continues from the highest existing UID and prevents concurrent collisions.

CREATE OR REPLACE FUNCTION public.generate_member_uid()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := EXTRACT(YEAR FROM now());
  v_next int;
  v_uid text;
BEGIN
  -- Serialize UID generation for the current year.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('member_uid:' || v_year::text, 0)
  );

  -- Continue above the highest existing UID.
  -- Historical gaps are intentionally preserved.
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
    AND uid LIKE 'LMD-' || v_year || '-%';

  v_uid := 'LMD-' || v_year || '-' || LPAD(v_next::text, 4, '0');

  RETURN v_uid;
END;
$function$;
