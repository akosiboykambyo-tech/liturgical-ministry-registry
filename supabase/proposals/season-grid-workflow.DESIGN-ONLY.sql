-- DESIGN PROPOSAL ONLY: NEVER APPLY BEFORE PR55 AUTHORIZATION REVIEW.
-- One season > parish/ministry batches > snapshots > claims > reviews.
-- Owner-only mutations MUST be exposed through reviewed transactional SECURITY DEFINER
-- functions backed by a private active-user allowlist (not app_metadata alone).
-- No anon/authenticated direct table grants and no public Storage policies.
BEGIN;
CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS registry_private.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_year integer NOT NULL UNIQUE CHECK (service_year BETWEEN 2000 AND 2200),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  due_at timestamptz,
  reminder_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES registry_private.seasons(id),
  parish text NOT NULL, ministry text NOT NULL,
  representative_name text,
  representative_contact text,
  door text NOT NULL DEFAULT 'phone' CHECK (door IN ('phone','paper','helper','csv')),
  status text NOT NULL DEFAULT 'Not sent'
    CHECK (status IN ('Not sent','Sent','In progress','Submitted','Needs review','Reviewed')),
  due_at timestamptz,
  sent_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, parish, ministry)
);
CREATE TABLE IF NOT EXISTS registry_private.batch_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  member_id uuid REFERENCES public.members(id),
  member_ministry_id uuid REFERENCES public.member_ministries(id),
  displayed_name text NOT NULL,
  membership_status_at_setup text,
  coverage_end_at_setup date,
  claim text NOT NULL DEFAULT 'No response'
    CHECK (claim IN ('No response','Renewing','Not renewing','Transferred','Deceased')),
  claim_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending','renewed','not_renewing','case_resolved','deferred')),
  held boolean NOT NULL DEFAULT false,
  responded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, member_ministry_id),
  CONSTRAINT no_unheld_sensitive_claim CHECK
    (claim NOT IN ('Transferred','Deceased') OR held OR outcome IN ('case_resolved','deferred'))
);
CREATE TABLE IF NOT EXISTS registry_private.batch_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  revision integer NOT NULL DEFAULT 1,
  source text NOT NULL CHECK (source IN ('phone','paper','helper','csv')),
  entered_by uuid REFERENCES auth.users(id),
  representative_name text,
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id,revision)
);
CREATE TABLE IF NOT EXISTS registry_private.batch_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  submission_id uuid REFERENCES registry_private.batch_submissions(id),
  first_name text NOT NULL, last_name text NOT NULL,
  proposed_contact text,
  matched_member_id uuid REFERENCES public.members(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked','created','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  roster_id uuid REFERENCES registry_private.batch_roster(id),
  addition_id uuid REFERENCES registry_private.batch_additions(id),
  kind text NOT NULL CHECK (kind IN ('duplicate','transfer','deceased','reactivation','unanswered','other')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','deferred','confirmed','rejected')),
  sensitive boolean NOT NULL DEFAULT false,
  reason text,
  review_by date,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'deferred' OR (length(btrim(coalesce(reason,''))) >= 10 AND review_by IS NOT NULL)),
  CHECK (roster_id IS NOT NULL OR addition_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS registry_private.batch_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  object_path text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid REFERENCES auth.users(id),
  submitted_source text NOT NULL CHECK (submitted_source IN ('representative','staff')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  inspected_by uuid REFERENCES auth.users(id),
  inspected_at timestamptz,
  replaced_at timestamptz,
  UNIQUE (batch_id, version)
);
CREATE TABLE IF NOT EXISTS registry_private.batch_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  token_digest text NOT NULL UNIQUE,
  code_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.batch_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid REFERENCES registry_private.batches(id),
  case_id uuid REFERENCES registry_private.review_cases(id),
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  actor_kind text NOT NULL CHECK (actor_kind IN ('admin','helper','representative','system')),
  before jsonb,
  after jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.batch_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  kind text NOT NULL CHECK (kind IN ('link_copied','link_shared','reminder','escalated')),
  channel text NOT NULL CHECK (channel IN ('sms_manual','messenger_manual','paper','helper')),
  recorded_by uuid REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.parish_helpers (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  parish text NOT NULL,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, parish)
);
CREATE INDEX IF NOT EXISTS batches_season_status_idx ON registry_private.batches(season_id,status);
CREATE INDEX IF NOT EXISTS cases_state_reviewby_idx ON registry_private.review_cases(state,review_by);
CREATE INDEX IF NOT EXISTS roster_batch_outcome_idx ON registry_private.batch_roster(batch_id,outcome,held);
CREATE INDEX IF NOT EXISTS events_batch_time_idx ON registry_private.batch_events(batch_id,occurred_at);
ALTER TABLE registry_private.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batch_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batch_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batch_additions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batch_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.batch_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.parish_helpers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA registry_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA registry_private FROM PUBLIC, anon, authenticated;
-- Important: even if applied in isolation, nothing is operable without separately
-- reviewed owner-only RPCs, rep-link/code gateway, private Storage and audited policies.
-- Registration status and member/parish affiliation schema intentionally unchanged.
-- Transactional approve and transfer handling MUST be designed and reviewed separately.
ROLLBACK;
