-- PR55 STAGING ONLY. Derived from public-table metadata of the production schema (7 Nov 2026).
-- No member data, Auth identities, Storage bytes, or secret values are copied.
-- NEW missing tables only; all default to RLS and no anon/authenticated privileges.
-- Production's legacy fixed-email/fixed-UUID policies are intentionally NOT copied.
-- DO NOT RUN ON PRODUCTION. Review schema diff before marking environment parity.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $preflight$
BEGIN
  IF current_database() IS NULL THEN RAISE EXCEPTION 'No database'; END IF;
  IF to_regclass('public.admin_login_attempts') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: admin_login_attempts'; END IF;
  IF to_regclass('public.admin_login_reservations') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: admin_login_reservations'; END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: audit_logs'; END IF;
  IF to_regclass('public.certificate_downloads') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: certificate_downloads'; END IF;
  IF to_regclass('public.name_correction_requests') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: name_correction_requests'; END IF;
  IF to_regclass('public.public_reports') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: public_reports'; END IF;
  IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: recommendation_renewal_batches'; END IF;
  IF to_regclass('public.recommendation_renewal_memberships') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: recommendation_renewal_memberships'; END IF;
  IF to_regclass('public.renewal_review_items') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: renewal_review_items'; END IF;
  IF to_regclass('public.scanned_duplicates') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: scanned_duplicates'; END IF;
  IF to_regclass('public.signatories') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: signatories'; END IF;
  IF to_regclass('public.system_settings') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: system_settings'; END IF;
  IF to_regclass('public.verification_rate_limits') IS NOT NULL THEN RAISE EXCEPTION 'Pre-existing table: verification_rate_limits'; END IF;
END $preflight$;

CREATE TABLE public."admin_login_attempts" (
  "identifier" text NOT NULL,
  "failures" integer NOT NULL DEFAULT 0,
  "window_started_at" timestamp with time zone,
  "locked_until" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."admin_login_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."admin_login_attempts" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."admin_login_attempts" TO service_role;

CREATE TABLE public."admin_login_reservations" (
  "token" uuid NOT NULL,
  "identifier" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."admin_login_reservations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."admin_login_reservations" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."admin_login_reservations" TO service_role;

CREATE TABLE public."audit_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "member_id" uuid,
  "admin_action" character varying(100) NOT NULL,
  "previous_state" jsonb,
  "new_state" jsonb,
  "timestamp" timestamp with time zone DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."audit_logs" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."audit_logs" TO service_role;

CREATE TABLE public."certificate_downloads" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL,
  "ministry" text,
  "download_count" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "member_ministry_id" uuid
);
ALTER TABLE public."certificate_downloads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."certificate_downloads" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."certificate_downloads" TO service_role;

CREATE TABLE public."name_correction_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "member_id" uuid,
  "registry_id" text NOT NULL,
  "current_first_name" text,
  "current_last_name" text,
  "parish" text,
  "corrected_name" text NOT NULL,
  "requester_email" text NOT NULL,
  "supporting_details" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "email_status" text NOT NULL DEFAULT 'pending'::text,
  "email_provider_id" text,
  "email_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at" timestamp with time zone,
  "resolved_at" timestamp with time zone
);
ALTER TABLE public."name_correction_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."name_correction_requests" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."name_correction_requests" TO service_role;

CREATE TABLE public."public_reports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "report_type" text NOT NULL,
  "subject" text NOT NULL,
  "details" text NOT NULL,
  "reporter_name" text NOT NULL,
  "reporter_email" text NOT NULL,
  "member_id" uuid,
  "registry_id" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at" timestamp with time zone,
  "resolved_at" timestamp with time zone
);
ALTER TABLE public."public_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."public_reports" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."public_reports" TO service_role;

CREATE TABLE public."recommendation_renewal_batches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "parish" text NOT NULL,
  "ministry" text,
  "document_url" text NOT NULL,
  "document_uploaded_at" timestamp with time zone NOT NULL DEFAULT now(),
  "renewal_date" date NOT NULL,
  "next_renewal_date" date NOT NULL,
  "notes" text,
  "processed_by" uuid,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."recommendation_renewal_batches" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."recommendation_renewal_batches" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."recommendation_renewal_batches" TO service_role;

CREATE TABLE public."recommendation_renewal_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL,
  "member_ministry_id" uuid,
  "member_id" uuid,
  "member_uid" text NOT NULL,
  "member_name" text NOT NULL,
  "parish" text NOT NULL,
  "ministry" text NOT NULL,
  "previous_status" character varying(30),
  "previous_start_date" date,
  "previous_expiration_date" date,
  "previous_renewal_date" date,
  "previous_document_url" text,
  "result_status" character varying(30) NOT NULL DEFAULT 'Renewed'::character varying,
  "result_expiration_date" date NOT NULL,
  "result_renewal_date" date NOT NULL,
  "result_document_url" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."recommendation_renewal_memberships" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."recommendation_renewal_memberships" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."recommendation_renewal_memberships" TO service_role;

CREATE TABLE public."renewal_review_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "submission_id" uuid NOT NULL,
  "source_filename" text NOT NULL,
  "source_position" integer NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "parish" text NOT NULL,
  "ministry" text NOT NULL,
  "reason" text NOT NULL,
  "candidates" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'open'::text,
  "open_case_key" text GENERATED ALWAYS AS (
CASE
    WHEN (status = 'open'::text) THEN ((((((((lower(btrim(first_name)) || '|'::text) || lower(btrim(last_name))) || '|'::text) || lower(btrim(parish))) || '|'::text) || lower(btrim(ministry))) || '|'::text) || reason)
    ELSE NULL::text
END) STORED,
  "resolution" text,
  "resolution_notes" text,
  "created_by" uuid NOT NULL,
  "resolved_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone
);
ALTER TABLE public."renewal_review_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."renewal_review_items" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."renewal_review_items" TO service_role;

CREATE TABLE public."scanned_duplicates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "group_key" text NOT NULL,
  "member_ids" text[] NOT NULL,
  "member_count" integer NOT NULL DEFAULT 1,
  "resolved" boolean NOT NULL DEFAULT false,
  "resolution" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."scanned_duplicates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."scanned_duplicates" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."scanned_duplicates" TO service_role;

CREATE TABLE public."signatories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "title" text NOT NULL DEFAULT ''::text,
  "signature_url" text,
  "display_type" text NOT NULL DEFAULT 'static'::text,
  "ministry" text,
  "position_x" integer NOT NULL DEFAULT 60,
  "position_y" integer NOT NULL DEFAULT 720,
  "width" integer NOT NULL DEFAULT 150,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "alignment" text NOT NULL DEFAULT 'left'::text
);
ALTER TABLE public."signatories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."signatories" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."signatories" TO service_role;

CREATE TABLE public."system_settings" (
  "key" character varying(50) NOT NULL,
  "value" jsonb NOT NULL,
  "is_default" boolean DEFAULT false
);
ALTER TABLE public."system_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."system_settings" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."system_settings" TO service_role;

CREATE TABLE public."verification_rate_limits" (
  "request_key" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "request_count" integer NOT NULL DEFAULT 1
);
ALTER TABLE public."verification_rate_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."verification_rate_limits" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."verification_rate_limits" TO service_role;

-- Exact production primary/foreign key, CHECK, and unique-constraint definitions.
ALTER TABLE public."admin_login_attempts" ADD CONSTRAINT "admin_login_attempts_failures_check" CHECK ((failures >= 0));
ALTER TABLE public."admin_login_attempts" ADD CONSTRAINT "admin_login_attempts_identifier_check" CHECK ((identifier ~ '^[a-f0-9]{64}$'::text));
ALTER TABLE public."admin_login_attempts" ADD CONSTRAINT "admin_login_attempts_pkey" PRIMARY KEY (identifier);
ALTER TABLE public."admin_login_reservations" ADD CONSTRAINT "admin_login_reservations_pkey" PRIMARY KEY (token);
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."certificate_downloads" ADD CONSTRAINT "certificate_downloads_pkey" PRIMARY KEY (id);
ALTER TABLE public."name_correction_requests" ADD CONSTRAINT "name_correction_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."name_correction_requests" ADD CONSTRAINT "name_correction_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'resolved'::text, 'rejected'::text])));
ALTER TABLE public."public_reports" ADD CONSTRAINT "public_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."public_reports" ADD CONSTRAINT "public_reports_report_type_check" CHECK ((report_type = ANY (ARRAY['record_detail'::text, 'authenticity'::text, 'renewal'::text, 'incident'::text, 'liturgy_assistance'::text, 'vestment_loan'::text, 'other'::text])));
ALTER TABLE public."public_reports" ADD CONSTRAINT "public_reports_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'resolved'::text, 'rejected'::text])));
ALTER TABLE public."recommendation_renewal_batches" ADD CONSTRAINT "pr55_batch_exact_calendar_year" CHECK ((next_renewal_date = ((renewal_date + '1 year'::interval))::date)) NOT VALID;
ALTER TABLE public."recommendation_renewal_batches" ADD CONSTRAINT "recommendation_renewal_batches_dates_check" CHECK ((next_renewal_date >= renewal_date));
ALTER TABLE public."recommendation_renewal_batches" ADD CONSTRAINT "recommendation_renewal_batches_pkey" PRIMARY KEY (id);
ALTER TABLE public."recommendation_renewal_memberships" ADD CONSTRAINT "pr55_renewal_snapshot_exact_year" CHECK ((((result_status)::text <> 'Renewed'::text) OR (result_expiration_date = ((result_renewal_date + '1 year'::interval))::date))) NOT VALID;
ALTER TABLE public."recommendation_renewal_memberships" ADD CONSTRAINT "recommendation_renewal_memberships_pkey" PRIMARY KEY (id);
ALTER TABLE public."recommendation_renewal_memberships" ADD CONSTRAINT "recommendation_renewal_memberships_previous_status_check" CHECK (((previous_status IS NULL) OR ((previous_status)::text = ANY ((ARRAY['Pending Verification'::character varying, 'New'::character varying, 'Renewed'::character varying, 'Inactive'::character varying])::text[]))));
ALTER TABLE public."recommendation_renewal_memberships" ADD CONSTRAINT "recommendation_renewal_memberships_result_status_check" CHECK (((result_status)::text = ANY ((ARRAY['Pending Verification'::character varying, 'New'::character varying, 'Renewed'::character varying, 'Inactive'::character varying])::text[])));
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_candidates_check" CHECK ((jsonb_typeof(candidates) = 'array'::text));
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_open_case_key_key" UNIQUE (open_case_key);
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_reason_check" CHECK ((reason = ANY (ARRAY['multiple_exact_members'::text, 'missing_membership'::text, 'same_name_different_parish'::text, 'similar_name'::text, 'duplicate_csv_membership'::text, 'unmatched'::text])));
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_resolution_check" CHECK ((resolution = ANY (ARRAY['member_verified'::text, 'ministry_assignment_verified'::text, 'registry_record_corrected'::text, 'csv_row_corrected'::text, 'duplicate_row'::text, 'no_action_required'::text, 'other'::text])));
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_source_filename_check" CHECK (((length(source_filename) >= 1) AND (length(source_filename) <= 255)));
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_source_position_check" CHECK ((source_position >= 1));
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text])));
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_submission_id_source_position_key" UNIQUE (submission_id, source_position);
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "resolved_has_decision" CHECK ((((status = 'open'::text) AND (resolution IS NULL) AND (resolution_notes IS NULL) AND (resolved_by IS NULL) AND (resolved_at IS NULL)) OR ((status = ANY (ARRAY['resolved'::text, 'dismissed'::text])) AND (resolution IS NOT NULL) AND (length(btrim(COALESCE(resolution_notes, ''::text))) >= 10) AND (resolved_by IS NOT NULL) AND (resolved_at IS NOT NULL))));
ALTER TABLE public."scanned_duplicates" ADD CONSTRAINT "scanned_duplicates_group_key_key" UNIQUE (group_key);
ALTER TABLE public."scanned_duplicates" ADD CONSTRAINT "scanned_duplicates_pkey" PRIMARY KEY (id);
ALTER TABLE public."signatories" ADD CONSTRAINT "signatories_alignment_check" CHECK ((alignment = ANY (ARRAY['left'::text, 'center'::text, 'right'::text])));
ALTER TABLE public."signatories" ADD CONSTRAINT "signatories_display_type_check" CHECK ((display_type = ANY (ARRAY['static'::text, 'dynamic'::text])));
ALTER TABLE public."signatories" ADD CONSTRAINT "signatories_pkey" PRIMARY KEY (id);
ALTER TABLE public."system_settings" ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY (key);
ALTER TABLE public."verification_rate_limits" ADD CONSTRAINT "verification_rate_limits_pkey" PRIMARY KEY (request_key, window_start);
ALTER TABLE public."verification_rate_limits" ADD CONSTRAINT "verification_rate_limits_positive_count" CHECK ((request_count >= 1));
ALTER TABLE public."admin_login_reservations" ADD CONSTRAINT "admin_login_reservations_identifier_fkey" FOREIGN KEY (identifier) REFERENCES admin_login_attempts(identifier) ON DELETE CASCADE;
ALTER TABLE public."certificate_downloads" ADD CONSTRAINT "certificate_downloads_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public."certificate_downloads" ADD CONSTRAINT "certificate_downloads_member_ministry_id_fkey" FOREIGN KEY (member_ministry_id) REFERENCES member_ministries(id) ON DELETE SET NULL;
ALTER TABLE public."name_correction_requests" ADD CONSTRAINT "name_correction_requests_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public."public_reports" ADD CONSTRAINT "public_reports_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public."recommendation_renewal_memberships" ADD CONSTRAINT "recommendation_renewal_memberships_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES recommendation_renewal_batches(id) ON DELETE CASCADE;
ALTER TABLE public."recommendation_renewal_memberships" ADD CONSTRAINT "recommendation_renewal_memberships_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public."recommendation_renewal_memberships" ADD CONSTRAINT "recommendation_renewal_memberships_member_ministry_id_fkey" FOREIGN KEY (member_ministry_id) REFERENCES member_ministries(id) ON DELETE SET NULL;
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."renewal_review_items" ADD CONSTRAINT "renewal_review_items_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id);

-- Non-constraint indexes from production schema.
CREATE INDEX IF NOT EXISTS admin_login_reservations_identifier_idx ON public.admin_login_reservations USING btree (identifier, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_downloads_member_ministry ON public.certificate_downloads USING btree (member_id, COALESCE(ministry, ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_downloads_membership ON public.certificate_downloads USING btree (member_ministry_id) WHERE (member_ministry_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_certificate_downloads_member_ministry_id ON public.certificate_downloads USING btree (member_ministry_id) WHERE (member_ministry_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS name_correction_requests_created_at_idx ON public.name_correction_requests USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS name_correction_requests_registry_id_idx ON public.name_correction_requests USING btree (registry_id);
CREATE INDEX IF NOT EXISTS name_correction_requests_status_idx ON public.name_correction_requests USING btree (status);
CREATE INDEX IF NOT EXISTS public_reports_created_at_idx ON public.public_reports USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS public_reports_registry_id_idx ON public.public_reports USING btree (registry_id);
CREATE INDEX IF NOT EXISTS public_reports_status_idx ON public.public_reports USING btree (status);
CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_batches_ministry ON public.recommendation_renewal_batches USING btree (ministry) WHERE (ministry IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_batches_parish ON public.recommendation_renewal_batches USING btree (parish);
CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_batches_processed_at ON public.recommendation_renewal_batches USING btree (processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_batch_id ON public.recommendation_renewal_memberships USING btree (batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_batch_membership ON public.recommendation_renewal_memberships USING btree (batch_id, member_ministry_id) WHERE (member_ministry_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_member_id ON public.recommendation_renewal_memberships USING btree (member_id) WHERE (member_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_member_ministry_id ON public.recommendation_renewal_memberships USING btree (member_ministry_id) WHERE (member_ministry_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS renewal_review_status_date_idx ON public.renewal_review_items USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS renewal_review_submission_idx ON public.renewal_review_items USING btree (submission_id);
CREATE INDEX IF NOT EXISTS idx_scanned_duplicates_group_key ON public.scanned_duplicates USING btree (group_key);
CREATE INDEX IF NOT EXISTS idx_scanned_duplicates_resolved ON public.scanned_duplicates USING btree (resolved);
CREATE INDEX IF NOT EXISTS idx_signatories_active ON public.signatories USING btree (is_active);
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_single_default ON public.system_settings USING btree (is_default) WHERE (is_default = true);
CREATE UNIQUE INDEX IF NOT EXISTS unique_default_template ON public.system_settings USING btree (is_default) WHERE (is_default = true);
CREATE INDEX IF NOT EXISTS verification_rate_limits_window_idx ON public.verification_rate_limits USING btree (window_start);

-- Strict, revocable staging access. Admins may read private history;
-- writes to these tables stay server/service-role only.
GRANT SELECT ON TABLE public."audit_logs" TO authenticated;
CREATE POLICY "pr55_stage_admin_read_audit_logs" ON public."audit_logs" FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
GRANT SELECT ON TABLE public."certificate_downloads" TO authenticated;
CREATE POLICY "pr55_stage_admin_read_certificate_downloads" ON public."certificate_downloads" FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
GRANT SELECT ON TABLE public."recommendation_renewal_batches" TO authenticated;
CREATE POLICY "pr55_stage_admin_read_recommendation_renewal_batches" ON public."recommendation_renewal_batches" FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
GRANT SELECT ON TABLE public."recommendation_renewal_memberships" TO authenticated;
CREATE POLICY "pr55_stage_admin_read_recommendation_renewal_memberships" ON public."recommendation_renewal_memberships" FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
GRANT SELECT ON TABLE public."renewal_review_items" TO authenticated;
CREATE POLICY "pr55_stage_admin_read_renewal_review_items" ON public."renewal_review_items" FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
GRANT SELECT ON TABLE public."scanned_duplicates" TO authenticated;
CREATE POLICY "pr55_stage_admin_read_scanned_duplicates" ON public."scanned_duplicates" FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));

-- Signatories and website settings retain intentional read-only public lookup;
-- new values are empty until separately seeded with test-only data.
GRANT SELECT ON TABLE public."signatories" TO anon, authenticated;
CREATE POLICY "pr55_stage_public_read_signatories" ON public."signatories" FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON TABLE public."system_settings" TO anon, authenticated;
CREATE POLICY "pr55_stage_public_read_system_settings" ON public."system_settings" FOR SELECT TO anon, authenticated USING (true);

-- Safe postcondition; do not assume full parity from table counts alone.
DO $verify$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_login_attempts','admin_login_reservations','audit_logs','certificate_downloads','name_correction_requests','public_reports','recommendation_renewal_batches','recommendation_renewal_memberships','renewal_review_items','scanned_duplicates','signatories','system_settings','verification_rate_limits'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'New table missing: %',t; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.' || t)) THEN RAISE EXCEPTION 'RLS disabled: %',t; END IF;
    IF has_table_privilege('anon','public.' || t,'INSERT') OR has_table_privilege('authenticated','public.' || t,'UPDATE') THEN
       RAISE EXCEPTION 'Unsafe staging table grant: %', t;
    END IF;
  END LOOP;
END $verify$;
