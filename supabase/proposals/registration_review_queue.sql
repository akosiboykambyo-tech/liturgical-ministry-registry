-- PROPOSAL ONLY. DO NOT APPLY TO ANY SUPABASE INSTANCE.
-- Registration duplicate-review storage scaffold, NOT a live workflow.
-- Explicit approval, schema inspection and isolated QA are prerequisites.
BEGIN;

CREATE TABLE public.registration_review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_key text NOT NULL UNIQUE CHECK (length(btrim(intake_key)) BETWEEN 8 AND 200),
  source text NOT NULL CHECK (source IN ('individual', 'bulk')),
  import_batch_id uuid,
  source_row integer CHECK (source_row > 0),
  incoming_payload jsonb NOT NULL CHECK (
    jsonb_typeof(incoming_payload) = 'object'
    AND incoming_payload ? 'first_name'
    AND incoming_payload ? 'last_name'
    AND incoming_payload ? 'parish'
    AND incoming_payload ? 'ministries'
  ),
  candidate_member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  match_reasons text[] NOT NULL DEFAULT '{}'::text[],
  matching_rule_version text NOT NULL CHECK (length(btrim(matching_rule_version)) > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolution text CHECK (resolution IN ('use_existing','transfer_parish','create_distinct','discard')),
  resolution_notes text,
  selected_member_id uuid REFERENCES public.members(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT review_bulk_row_source CHECK (
    (source = 'bulk' AND source_row IS NOT NULL)
    OR (source = 'individual' AND source_row IS NULL)
  ),
  CONSTRAINT review_resolution_consistency CHECK (
    (status = 'open' AND resolution IS NULL AND resolution_notes IS NULL
      AND selected_member_id IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR
    (status IN ('resolved','dismissed')
      AND resolution IS NOT NULL
      AND length(btrim(coalesce(resolution_notes,''))) >= 10
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND ((status = 'dismissed' AND resolution = 'discard')
        OR (status = 'resolved' AND resolution <> 'discard'))
      AND ((resolution IN ('use_existing','transfer_parish') AND selected_member_id IS NOT NULL)
        OR (resolution IN ('create_distinct','discard') AND selected_member_id IS NULL)))
  )
);

CREATE UNIQUE INDEX registration_review_batch_row_unique
ON public.registration_review_cases(import_batch_id,source_row)
WHERE import_batch_id IS NOT NULL AND source_row IS NOT NULL;

CREATE INDEX registration_review_status_created_idx
ON public.registration_review_cases(status,created_at DESC);

CREATE TABLE public.registration_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.registration_review_cases(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created','resolved','dismissed')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  decision_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(decision_snapshot) = 'object'),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10)
);
CREATE INDEX registration_review_events_case_date_idx
ON public.registration_review_events(case_id,occurred_at,id);

-- Default-deny. No client grants or auth policies in this proposal.
-- All later server/RPC integration must explicitly define and test authorization.
ALTER TABLE public.registration_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_review_cases, public.registration_review_events
  FROM PUBLIC, anon, authenticated;
-- No GRANT to authenticated and no RLS POLICY means no browser access.
-- The service_role bypasses RLS; secrets MUST remain server-side only.
-- Do not grant a general-purpose browser interface to these tables.

-- Guard immutable case intake and finalized decisions. Future privileged
-- transactional resolution routine must increment version exactly once.
CREATE FUNCTION public.protect_registration_review_case()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.id, NEW.intake_key, NEW.source, NEW.import_batch_id, NEW.source_row,
      NEW.incoming_payload, NEW.candidate_member_ids, NEW.match_reasons,
      NEW.matching_rule_version, NEW.created_by, NEW.created_at)
      IS DISTINCT FROM
     (OLD.id, OLD.intake_key, OLD.source, OLD.import_batch_id, OLD.source_row,
      OLD.incoming_payload, OLD.candidate_member_ids, OLD.match_reasons,
      OLD.matching_rule_version, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Registration review intake details are immutable';
  END IF;
  IF OLD.status <> 'open' OR NEW.status = 'open' OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Invalid registration review state transition';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_registration_review_case()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_registration_review_case_trigger
BEFORE UPDATE ON public.registration_review_cases
FOR EACH ROW EXECUTE FUNCTION public.protect_registration_review_case();

-- Audit entries are append-only, including for privileged database writers.
CREATE FUNCTION public.protect_registration_review_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Registration review audit events cannot be modified or deleted';
END;
$$;
REVOKE ALL ON FUNCTION public.protect_registration_review_event()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_registration_review_event_trigger
BEFORE UPDATE OR DELETE ON public.registration_review_events
FOR EACH ROW EXECUTE FUNCTION public.protect_registration_review_event();

COMMIT;

-- Outstanding BEFORE execution: inspect current duplicate_flags/import_batches,
-- decide secure role provisioning, audit event creation transaction,
-- choose candidate selection rules, enforce document and expiry validation,
-- finalize retention/backfill, and test on an isolated disposable DB.
