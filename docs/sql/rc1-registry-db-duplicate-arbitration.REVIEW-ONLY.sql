-- REVIEW ONLY: RC1 server-authoritative duplicate arbitration candidate.
-- DO NOT RUN in TEST or Production without independent DBA/security approval.
-- Trial ONLY in a disposable, representative Supabase database.
--
-- Rationale: an active Registry admin can call registry_admin_member_write_v1
-- directly, bypassing browser duplicate checks and creating same-name
-- cross-parish / similar-name profiles. This trigger fails CLOSED on member
-- CREATE or identifying-field UPDATE regardless of client implementation.
-- No existing profiles are removed or automatically merged.
--
-- Trade-offs requiring review: identity similarities can involve different
-- real people; records must be submitted to a supervised review path. Each
-- insert scans existing names under a single advisory lock. Benchmark with
-- 1k, 10k, and expected peak CSV volumes before authorizing deployment.

CREATE SCHEMA IF NOT EXISTS registry_private;
CREATE OR REPLACE FUNCTION registry_private.rc1_name_normalize(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path TO ''
AS $guard$
  SELECT pg_catalog.lower(pg_catalog.btrim(
    pg_catalog.regexp_replace(p_name, '[[:space:]]+', ' ', 'g')
  ))
$guard$;

CREATE OR REPLACE FUNCTION registry_private.rc1_name_edit_distance(p_a text,p_b text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path TO ''
AS $guard$
DECLARE
  a text := p_a; b text := p_b;
  i integer; j integer; cost integer;
  previous integer[]; current integer[];
BEGIN
  IF a=b THEN RETURN 0; END IF;
  SELECT pg_catalog.array_agg(g ORDER BY g) INTO previous
  FROM pg_catalog.generate_series(0,pg_catalog.char_length(b)) AS g;
  FOR i IN 1..pg_catalog.char_length(a) LOOP
    current := ARRAY[i];
    FOR j IN 1..pg_catalog.char_length(b) LOOP
      cost := CASE WHEN pg_catalog.substr(a,i,1)=pg_catalog.substr(b,j,1) THEN 0 ELSE 1 END;
      current := pg_catalog.array_append(current, pg_catalog.least(
        previous[j+1]+1,
        current[j]+1,
        previous[j]+cost
      ));
    END LOOP;
    previous := current;
  END LOOP;
  RETURN previous[pg_catalog.char_length(b)+1];
END
$guard$;

CREATE OR REPLACE FUNCTION registry_private.rc1_names_similar(p_a text,p_b text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path TO ''
AS $guard$
DECLARE
  a text := registry_private.rc1_name_normalize(p_a);
  b text := registry_private.rc1_name_normalize(p_b);
  digits_a text[];
  digits_b text[];
  longest integer;
BEGIN
  IF a=b THEN RETURN true; END IF;
  SELECT COALESCE(pg_catalog.array_agg(m[1] ORDER BY n),ARRAY[]::text[])
  INTO digits_a FROM pg_catalog.regexp_matches(a,'[[:digit:]]+','g')
  WITH ORDINALITY AS v(m,n);
  SELECT COALESCE(pg_catalog.array_agg(m[1] ORDER BY n),ARRAY[]::text[])
  INTO digits_b FROM pg_catalog.regexp_matches(b,'[[:digit:]]+','g')
  WITH ORDINALITY AS v(m,n);
  IF digits_a IS DISTINCT FROM digits_b THEN RETURN false; END IF;
  IF pg_catalog.char_length(a)<=3 OR pg_catalog.char_length(b)<=3 THEN RETURN false; END IF;
  longest := pg_catalog.greatest(pg_catalog.char_length(a),pg_catalog.char_length(b));
  IF pg_catalog.abs(pg_catalog.char_length(a)-pg_catalog.char_length(b))::numeric / longest > 0.2
  THEN RETURN false; END IF;
  RETURN 1 - registry_private.rc1_name_edit_distance(a,b)::numeric/longest >= 0.8;
END
$guard$;

CREATE OR REPLACE FUNCTION registry_private.rc1_guard_new_member_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $guard$
BEGIN
  IF TG_OP='UPDATE' AND
    NEW.first_name IS NOT DISTINCT FROM OLD.first_name AND
    NEW.last_name IS NOT DISTINCT FROM OLD.last_name AND
    NEW.parish IS NOT DISTINCT FROM OLD.parish
  THEN RETURN NEW; END IF;

  IF pg_catalog.btrim(coalesce(NEW.first_name,''))='' OR
     pg_catalog.btrim(coalesce(NEW.last_name,''))='' OR
     pg_catalog.btrim(coalesce(NEW.parish,''))=''
  THEN RAISE EXCEPTION 'Member identity fields are required' USING ERRCODE='22023'; END IF;

  -- A single xact-scoped lock prevents two concurrent creates from both
  -- passing the identity scan before either insert commits.
  PERFORM pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended('rc1_registry_new_member_identity_guard',0)
  );
  IF EXISTS(
     SELECT 1 FROM public.members m
     WHERE m.id IS DISTINCT FROM NEW.id
       AND registry_private.rc1_names_similar(NEW.first_name,m.first_name)
       AND registry_private.rc1_names_similar(NEW.last_name,m.last_name)
  )
  THEN
     RAISE EXCEPTION 'Potential duplicate member: supervised review required'
       USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION registry_private.rc1_name_normalize(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION registry_private.rc1_name_edit_distance(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION registry_private.rc1_names_similar(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION registry_private.rc1_guard_new_member_identity() FROM PUBLIC, anon, authenticated;

-- This REVIEW-ONLY file is applied in QA after the existing five
-- Production-equivalent triggers are installed. No Production migration yet.
CREATE TRIGGER rc1_registry_duplicate_guard
BEFORE INSERT OR UPDATE OF first_name,last_name,parish ON public.members
FOR EACH ROW EXECUTE FUNCTION registry_private.rc1_guard_new_member_identity();
