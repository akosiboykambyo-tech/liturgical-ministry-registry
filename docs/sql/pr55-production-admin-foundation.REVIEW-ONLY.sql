-- PR55 SECURITY PHASE 1: REVIEW ONLY, deliberately NONEXECUTABLE.
-- Production: install an EMPTY private administrator table only after
-- independent approved migration/backup/restore evidence.
BEGIN;
DO $stop$ BEGIN
 RAISE EXCEPTION 'PR55 NO-GO: administrator allowlist foundation awaits explicit release authorization';
END $stop$;
-- STOP - all remaining SQL is unreachable.
DO $guard$ BEGIN
 IF to_regclass('registry_private.registration_administrators') IS NOT NULL
 OR to_regclass('auth.users') IS NULL
 THEN RAISE EXCEPTION 'Admin foundation already present or Auth unavailable'
   USING ERRCODE='42501'; END IF;
END $guard$;
CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC,anon,authenticated;
CREATE TABLE registry_private.registration_administrators(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT false,
 granted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 revoked_at timestamptz,
 CONSTRAINT registration_admin_active_consistency
 CHECK (NOT active OR revoked_at IS NULL)
);
REVOKE ALL ON TABLE registry_private.registration_administrators FROM PUBLIC,anon,authenticated;
ALTER TABLE registry_private.registration_administrators ENABLE ROW LEVEL SECURITY;
-- Empty by design. Privileged operator must separately verify the intended
-- administrator's real auth.users.id, review identity / approvals, then seed
-- via a distinct audited transaction (never use email/JWT user_metadata).
-- Do not turn off original policies or activate feature before seed & tests.
COMMIT;
