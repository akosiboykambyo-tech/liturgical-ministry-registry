-- Isolated staging ONLY: project rtptybxugjhvpfjvcvgw.
-- No existing UID rotation; trigger affects future INSERTs only.
-- NOT the production UID migration, and not production-ready.
BEGIN;
CREATE SCHEMA IF NOT EXISTS registry_test_private;
CREATE OR REPLACE FUNCTION registry_test_private.assign_staging_member_uid()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  part text;
  candidate text;
  i integer;
  attempt integer;
BEGIN
  IF NEW.service_year IS NULL OR NEW.service_year NOT BETWEEN 1000 AND 9999 THEN
    RAISE EXCEPTION 'Invalid service year' USING ERRCODE = '22023';
  END IF;
  FOR attempt IN 1..100 LOOP
    part := '';
    bytes := extensions.gen_random_bytes(24);
    FOR i IN 0..23 LOOP
      IF pg_catalog.get_byte(bytes,i) < 248 THEN
        part := part || pg_catalog.substr(alphabet,
          (pg_catalog.get_byte(bytes,i) % pg_catalog.length(alphabet))+1,1);
        EXIT WHEN pg_catalog.length(part)=12;
      END IF;
    END LOOP;
    IF pg_catalog.length(part) <> 12 THEN CONTINUE; END IF;
    candidate := 'LMD-' || NEW.service_year::text || '-' ||
      pg_catalog.substr(part,1,4) || '-' ||
      pg_catalog.substr(part,5,4) || '-' ||
      pg_catalog.substr(part,9,4);
    IF NOT EXISTS (SELECT 1 FROM public.members WHERE uid=candidate) THEN
      NEW.uid := candidate;
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'UID allocation failed' USING ERRCODE = '23505';
END;
$fn$;
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.members'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Existing custom members trigger; review before proceeding';
  END IF;
END;
$check$;
CREATE TRIGGER registration_staging_assign_uid
BEFORE INSERT ON public.members
FOR EACH ROW EXECUTE FUNCTION registry_test_private.assign_staging_member_uid();
COMMIT;
