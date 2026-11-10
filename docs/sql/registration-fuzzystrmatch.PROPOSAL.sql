-- PR #55 PROPOSAL ONLY — DO NOT RUN ON PRODUCTION UNTIL REVIEWED.
-- Production read-only inspection on 2026-10-24 confirmed fuzzystrmatch absent
-- and pgcrypto installed in schema extensions. Staging already has fuzzystrmatch.
--
-- Convert this draft to a versioned Supabase migration through the normal
-- migration workflow only after explicit production authorization, backups,
-- maintenance/roll-forward plan, security review and schema-faithful staging QA.
-- This proposal does NOT install registration tables, grants, or RPCs.
BEGIN;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;
DO $assert$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
   WHERE e.extname='fuzzystrmatch' AND n.nspname='extensions'
 ) OR to_regprocedure('extensions.levenshtein(text,text)') IS NULL
 THEN
   RAISE EXCEPTION 'fuzzystrmatch must be installed in extensions with levenshtein(text,text)';
 END IF;
END
$assert$;
COMMIT;
-- On migration failure, the transaction automatically rolls back.
-- On application rollback, do NOT automatically DROP EXTENSION: other functions
-- may acquire dependencies. Leaving an unused extension installed is safer than
-- dropping it blindly. Review ownership, schema grants and extension advisory
-- findings before any future removal.
