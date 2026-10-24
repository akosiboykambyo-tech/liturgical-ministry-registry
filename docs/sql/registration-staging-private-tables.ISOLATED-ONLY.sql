-- STAGING ONLY: isolated Supabase rtptybxugjhvpfjvcvgw
-- Three private tables, explicit deny-by-default; no existing fixture updates.
BEGIN;
CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC, anon, authenticated;
CREATE TABLE registry_private.registration_administrators (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT false,
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CHECK (NOT active OR revoked_at IS NULL)
);
CREATE TABLE registry_private.registration_intake_requests (
 request_key uuid PRIMARY KEY,
 fingerprint text NOT NULL,
 actor_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('created','review')),
 member_id uuid REFERENCES public.members(id),
 review_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((outcome='created' AND member_id IS NOT NULL AND review_id IS NULL)
    OR (outcome='review' AND review_id IS NOT NULL AND member_id IS NULL))
);
CREATE TABLE registry_private.registration_intake_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_key uuid NOT NULL UNIQUE,
 existing_member_id uuid NOT NULL REFERENCES public.members(id),
 submitted_first_name text NOT NULL,
 submitted_last_name text NOT NULL,
 submitted_parish text NOT NULL,
 submitted_ministries text[] NOT NULL,
 submitted_service_year integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','dismissed')),
 submitted_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE registry_private.registration_intake_requests
 ADD CONSTRAINT registration_request_review_fk
 FOREIGN KEY(review_id) REFERENCES registry_private.registration_intake_reviews(id);
REVOKE ALL ON ALL TABLES IN SCHEMA registry_private FROM PUBLIC, anon, authenticated;
ALTER TABLE registry_private.registration_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.registration_intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.registration_intake_reviews ENABLE ROW LEVEL SECURITY;
-- Explicitly lock table privileges; no policies grant direct client access.
COMMIT;