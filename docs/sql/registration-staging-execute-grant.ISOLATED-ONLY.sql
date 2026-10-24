-- ISOLATED STAGING ONLY: execute after the function definition script,
-- which intentionally revokes authenticated EXECUTE by default.
-- Require the active test administrator row and canonical ministry mapping
-- before opening the function. The SECURITY DEFINER function itself still
-- checks auth.uid() against the private administrator table each time.
DO $grant$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM registry_private.registration_administrators
                 WHERE active AND revoked_at IS NULL)
     OR (SELECT count(*) FROM registry_private.registration_allowed_ministries) <> 6
     OR to_regprocedure('public.registration_intake_v1(uuid,text,text,text,text[],integer)') IS NULL
  THEN
    RAISE EXCEPTION 'Staging grant prerequisites missing';
  END IF;
END $grant$;
GRANT EXECUTE ON FUNCTION public.registration_intake_v1(uuid,text,text,text,text[],integer) TO authenticated;
