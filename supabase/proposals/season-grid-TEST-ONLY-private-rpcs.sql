-- TEST DATABASE ONLY: Ministry-Registry-Test (rtptybxugjhvpfjvcvgw).
-- NOT AN APPROVED PRODUCTION MIGRATION.
-- Narrow owner-only read/setup functions for the season-grid foundation.
-- Core registry rows and credentials are NEVER changed by this script.
BEGIN;

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
  UNIQUE(batch_id, member_ministry_id),
  CHECK (claim NOT IN ('Transferred','Deceased') OR held OR outcome IN ('case_resolved','deferred'))
);
CREATE TABLE IF NOT EXISTS registry_private.batch_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  source text NOT NULL CHECK(source IN ('phone','paper','helper','csv')),
  entered_by uuid REFERENCES auth.users(id),
  representative_name text,
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id, revision)
);
CREATE TABLE IF NOT EXISTS registry_private.batch_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  submission_id uuid REFERENCES registry_private.batch_submissions(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  proposed_contact text,
  matched_member_id uuid REFERENCES public.members(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','linked','created','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  roster_id uuid REFERENCES registry_private.batch_roster(id),
  addition_id uuid REFERENCES registry_private.batch_additions(id),
  kind text NOT NULL CHECK(kind IN ('duplicate','transfer','deceased','reactivation','unanswered','other')),
  state text NOT NULL DEFAULT 'open'
    CHECK(state IN ('open','deferred','confirmed','rejected')),
  sensitive boolean NOT NULL DEFAULT false,
  reason text,
  review_by date,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'deferred' OR (length(trim(coalesce(reason,''))) >= 10 AND review_by IS NOT NULL)),
  CHECK (roster_id IS NOT NULL OR addition_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS registry_private.batch_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  object_path text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  uploaded_by uuid REFERENCES auth.users(id),
  submitted_source text NOT NULL CHECK(submitted_source IN ('representative','staff')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  inspected_by uuid REFERENCES auth.users(id),
  inspected_at timestamptz,
  replaced_at timestamptz,
  UNIQUE(batch_id,version)
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
  actor_kind text NOT NULL CHECK(actor_kind IN ('admin','helper','representative','system')),
  before jsonb,
  after jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.batch_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES registry_private.batches(id),
  kind text NOT NULL CHECK(kind IN ('link_copied','link_shared','reminder','escalated')),
  channel text NOT NULL CHECK(channel IN ('sms_manual','messenger_manual','paper','helper')),
  recorded_by uuid REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registry_private.parish_helpers (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  parish text NOT NULL,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  revoked_at timestamptz,
  PRIMARY KEY(user_id,parish)
);
CREATE INDEX IF NOT EXISTS batches_season_status_idx ON registry_private.batches(season_id,status);
CREATE INDEX IF NOT EXISTS roster_batch_outcome_idx ON registry_private.batch_roster(batch_id,outcome,held);
CREATE INDEX IF NOT EXISTS cases_state_review_by_idx ON registry_private.review_cases(state,review_by);
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
REVOKE ALL ON ALL TABLES IN SCHEMA registry_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA registry_private FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION registry_private.owner_season_grid_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
   SELECT 1 FROM registry_private.registration_administrators a
   WHERE a.user_id=auth.uid() AND a.active=true AND a.revoked_at IS NULL
 ) THEN RAISE EXCEPTION 'Not authorized to view seasons' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'seasons', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',s.id,'service_year',s.service_year,'state',s.state) ORDER BY s.service_year DESC)
    FROM registry_private.seasons s
  ),'[]'::jsonb),
  'needs_review',(SELECT count(*) FROM registry_private.batches WHERE status='Needs review'),
  'batches',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'parish',b.parish,'ministry',b.ministry,'service_year',s.service_year,
      'status',b.status,'door',b.door,'due_at',b.due_at,
      'total',(SELECT count(*) FROM registry_private.batch_roster r WHERE r.batch_id=b.id),
      'approved',(SELECT count(*) FROM registry_private.batch_roster r WHERE r.batch_id=b.id AND r.outcome='renewed'),
      'held',(SELECT count(*) FROM registry_private.batch_roster r WHERE r.batch_id=b.id AND r.held AND r.outcome='pending'),
      'deferred',(SELECT count(*) FROM registry_private.batch_roster r WHERE r.batch_id=b.id AND r.outcome='deferred')
    ) ORDER BY b.parish,b.ministry)
    FROM registry_private.batches b JOIN registry_private.seasons s ON s.id=b.season_id
  ),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION registry_private.owner_batch_workspace_v1(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
   SELECT 1 FROM registry_private.registration_administrators a
   WHERE a.user_id=auth.uid() AND a.active=true AND a.revoked_at IS NULL
 ) THEN RAISE EXCEPTION 'Not authorized to view batch' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'id',b.id,'parish',b.parish,'ministry',b.ministry,'service_year',s.service_year,
  'door',b.door,'representative_name',b.representative_name,'status',b.status,
  'last_activity_at',b.updated_at,
  'letter_state',COALESCE((
    SELECT CASE WHEN l.inspected_at IS NOT NULL THEN 'reviewed' ELSE 'submitted' END
    FROM registry_private.batch_letters l WHERE l.batch_id=b.id ORDER BY l.version DESC LIMIT 1
  ),'pending'),
  'people',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.displayed_name,'uid',COALESCE(m.uid,''),
      'admin_status',COALESCE(mm.status,r.membership_status_at_setup,'Pending Verification'),
      'expiration_date',mm.expiration_date,
      'claim',r.claim,'outcome',r.outcome,'held',r.held,'conflict',false
    ) ORDER BY r.displayed_name)
    FROM registry_private.batch_roster r
    LEFT JOIN public.members m ON m.id=r.member_id
    LEFT JOIN public.member_ministries mm ON mm.id=r.member_ministry_id
    WHERE r.batch_id=b.id
  ),'[]'::jsonb),
  'cases',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'kind',c.kind,'state',c.state,'roster_id',c.roster_id,
      'detail',COALESCE(c.reason,''),'review_by',c.review_by,'sensitive',c.sensitive
    ) ORDER BY c.created_at)
    FROM registry_private.review_cases c WHERE c.batch_id=b.id
  ),'[]'::jsonb)
 ) INTO v
 FROM registry_private.batches b JOIN registry_private.seasons s ON s.id=b.season_id
 WHERE b.id=p_batch_id;
 IF v IS NULL THEN RAISE EXCEPTION 'Batch not found' USING ERRCODE='P0002'; END IF;
 RETURN v;
END $fn$;

-- These exposed wrappers are SECURITY INVOKER. Only the unexposed private
-- routines are SECURITY DEFINER, with a fresh revocable allowlist check.
CREATE OR REPLACE FUNCTION public.season_grid_overview_v1()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT registry_private.owner_season_grid_v1(); $fn$;
CREATE OR REPLACE FUNCTION public.season_batch_workspace_v1(p_batch_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT registry_private.owner_batch_workspace_v1(p_batch_id); $fn$;

REVOKE ALL ON FUNCTION registry_private.owner_season_grid_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION registry_private.owner_batch_workspace_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.season_grid_overview_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.season_batch_workspace_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA registry_private TO authenticated;
GRANT EXECUTE ON FUNCTION registry_private.owner_season_grid_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION registry_private.owner_batch_workspace_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.season_grid_overview_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.season_batch_workspace_v1(uuid) TO authenticated;
COMMIT;