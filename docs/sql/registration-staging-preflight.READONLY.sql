-- PR #54 STAGING PREFLIGHT — READ ONLY
-- Execute only against the explicitly selected ISOLATED test project.
-- Every requirement must be true before running an atomic intake migration.
-- Does not contain INSERT, UPDATE, DELETE, CREATE, ALTER or DROP.
WITH checks AS (
  SELECT
    (SELECT count(*) > 0 FROM pg_trigger
      WHERE tgrelid = 'public.members'::regclass
        AND NOT tgisinternal AND (tgtype & 2) = 2) AS has_before_insert_uid_candidate,
    EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.members'::regclass AND attname = 'uid'
        AND atttypid = 'text'::regtype
    ) AS uid_is_text,
    EXISTS (
      SELECT 1 FROM pg_extension e
      JOIN pg_namespace n ON n.oid=e.extnamespace
      WHERE e.extname='fuzzystrmatch' AND n.nspname='extensions'
    ) AS fuzzy_match_extension,
    EXISTS (
      SELECT 1 FROM pg_extension e
      JOIN pg_namespace n ON n.oid=e.extnamespace
      WHERE e.extname='pgcrypto' AND n.nspname='extensions'
    ) AS digest_extension,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='member_ministries'
        AND column_name='member_id' AND udt_name='uuid'
    ) AS assignment_fk_column
)
SELECT *,(
  has_before_insert_uid_candidate AND uid_is_text AND
  fuzzy_match_extension AND digest_extension AND assignment_fk_column
) AS basic_schema_ready
FROM checks;
