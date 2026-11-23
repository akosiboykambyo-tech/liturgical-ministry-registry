-- Source: read-only Production PostgreSQL catalog on 2026-11-23.
-- Schema, trigger functions, indexes and constraints ONLY. NO production rows,
-- identities, credentials, Storage object bytes or private documents.
-- Isolated local Supabase QA only. NEVER execute on TEST/Production.
\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS registry_private;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE "public"."members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uid" character varying(50),
  "first_name" character varying(100) NOT NULL,
  "last_name" character varying(100) NOT NULL,
  "parish" character varying(255) NOT NULL,
  "ministries" text[] NOT NULL,
  "status" character varying(30) DEFAULT 'Pending Verification'::character varying NOT NULL,
  "document_url" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "notes" text,
  "expiration_date" date,
  "archived_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "service_year" integer NOT NULL,
  CONSTRAINT "members_randomized_uid_format_check" CHECK (((uid IS NOT NULL) AND ((uid)::text ~ '^LMD-[0-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$'::text) AND (SUBSTRING(uid FROM 5 FOR 4) = (service_year)::text))),
  CONSTRAINT "members_pkey" PRIMARY KEY (id),
  CONSTRAINT "members_uid_key" UNIQUE (uid)
);
CREATE TABLE "public"."member_ministries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL,
  "ministry" text NOT NULL,
  "status" character varying(30) DEFAULT 'Pending Verification'::character varying NOT NULL,
  "start_date" date,
  "expiration_date" date,
  "renewal_date" date,
  "document_url" text,
  "document_uploaded_at" timestamp with time zone,
  "archived_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "member_ministries_status_check" CHECK (((status)::text = ANY ((ARRAY['Pending Verification'::character varying, 'New'::character varying, 'Renewed'::character varying, 'Inactive'::character varying])::text[]))),
  CONSTRAINT "member_ministries_pkey" PRIMARY KEY (id),
  CONSTRAINT "member_ministries_member_ministry_key" UNIQUE (member_id, ministry)
);
CREATE TABLE "public"."import_batches" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "file_hash" text NOT NULL,
  "file_name" text,
  "row_count" integer DEFAULT 0 NOT NULL,
  "unique_inserted" integer DEFAULT 0 NOT NULL,
  "duplicates_routed" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'processing'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY (id),
  CONSTRAINT "import_batches_file_hash_key" UNIQUE (file_hash)
);
CREATE TABLE "public"."duplicate_flags" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "existing_member_id" uuid,
  "incoming_data" jsonb NOT NULL,
  "resolved" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "duplicate_flags_pkey" PRIMARY KEY (id)
);
CREATE TABLE "public"."audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid,
  "admin_action" character varying(100) NOT NULL,
  "previous_state" jsonb,
  "new_state" jsonb,
  "timestamp" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id)
);
CREATE TABLE "registry_private"."registration_administrators" (
  "user_id" uuid NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "granted_at" timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "registration_admin_active_consistency" CHECK (((NOT active) OR (revoked_at IS NULL))),
  CONSTRAINT "registration_administrators_pkey" PRIMARY KEY (user_id)
);
ALTER TABLE "public"."duplicate_flags" ADD CONSTRAINT "duplicate_flags_existing_member_id_fkey" FOREIGN KEY (existing_member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE "public"."member_ministries" ADD CONSTRAINT "member_ministries_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE "registry_private"."registration_administrators" ADD CONSTRAINT "registration_administrators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_import_batches_file_hash ON public.import_batches USING btree (file_hash);
CREATE INDEX idx_import_batches_status ON public.import_batches USING btree (status);
CREATE INDEX idx_member_ministries_expiration_date ON public.member_ministries USING btree (expiration_date) WHERE (expiration_date IS NOT NULL);
CREATE INDEX idx_member_ministries_member_id ON public.member_ministries USING btree (member_id);
CREATE INDEX idx_member_ministries_ministry ON public.member_ministries USING btree (ministry);
CREATE INDEX idx_member_ministries_status ON public.member_ministries USING btree (status);
CREATE INDEX idx_members_expiration_date ON public.members USING btree (expiration_date) WHERE (expiration_date IS NOT NULL);
CREATE UNIQUE INDEX unique_member_registry_idx ON public.members USING btree (first_name, last_name, parish, ministries);
CREATE UNIQUE INDEX uq_members_name_parish_ministries ON public.members USING btree (lower((first_name)::text), lower((last_name)::text), lower((parish)::text), ministries);
CREATE OR REPLACE FUNCTION public.assign_member_uid()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.service_year IS NULL
     OR NEW.service_year NOT BETWEEN 1000 AND 9999
  THEN
    RAISE EXCEPTION
      'A valid four-digit service year is required';
  END IF;

  NEW.uid := public.generate_member_uid(
    NEW.service_year
  );

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION registry_private.enforce_member_ministry_year_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_check boolean;
  v_anchor date;
BEGIN
  -- Preserve pre-existing exceptions on unrelated metadata updates; validate
  -- every new row and every actual status/date transition.
  IF TG_OP = 'INSERT' THEN
    v_check := true;
  ELSE
    v_check := NEW.status IS DISTINCT FROM OLD.status
      OR NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.renewal_date IS DISTINCT FROM OLD.renewal_date
      OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date;
  END IF;

  IF NOT v_check OR NEW.status NOT IN ('New','Renewed') THEN
    RETURN NEW;
  END IF;

  v_anchor := CASE
    WHEN NEW.status = 'New' THEN NEW.start_date
    ELSE NEW.renewal_date
  END;

  IF v_anchor IS NULL
    OR NEW.expiration_date IS NULL
    OR NEW.expiration_date IS DISTINCT FROM (v_anchor + INTERVAL '1 year')::date
  THEN
    RAISE EXCEPTION
      'Active ministry registration must expire one calendar year after verification or renewal'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION public.generate_member_uid(p_service_year integer)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_alphabet constant text :=
    'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_random_part text;
  v_byte integer;
  v_uid text;
  v_attempt integer;
  v_position integer;
BEGIN
  IF p_service_year IS NULL
     OR p_service_year NOT BETWEEN 1000 AND 9999
  THEN
    RAISE EXCEPTION 'Invalid service year for Registry ID';
  END IF;

  -- Serialize generation for the same service year.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member_uid:' || p_service_year::text,
      0
    )
  );

  FOR v_attempt IN 1..100 LOOP
    v_random_part := '';


    -- Generate random bytes in batches instead of one at a time.
    -- Rejection sampling preserves uniform character selection.
    WHILE length(v_random_part) < 12 LOOP
      FOR v_byte IN
        SELECT pg_catalog.get_byte(bytes, pos)
        FROM (
          SELECT extensions.gen_random_bytes(32) AS bytes
        ) AS random_batch
        CROSS JOIN LATERAL
          pg_catalog.generate_series(0, 31) AS positions(pos)
      LOOP
        IF v_byte < 248 THEN
          v_position := (v_byte % 31) + 1;

          v_random_part := v_random_part ||
            pg_catalog.substr(
              v_alphabet,
              v_position,
              1
            );

          EXIT WHEN length(v_random_part) = 12;
        END IF;
      END LOOP;
    END LOOP;


    v_uid :=
      'LMD-' ||
      p_service_year::text ||
      '-' ||
      pg_catalog.substr(v_random_part, 1, 4) ||
      '-' ||
      pg_catalog.substr(v_random_part, 5, 4) ||
      '-' ||
      pg_catalog.substr(v_random_part, 9, 4);

    IF NOT EXISTS (
      SELECT 1
      FROM public.members
      WHERE uid = v_uid
    ) THEN
      RETURN v_uid;
    END IF;
  END LOOP;

  RAISE EXCEPTION
    'Unable to generate a unique randomized Registry ID';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_member_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
IF TG_OP = 'INSERT' THEN
INSERT INTO audit_logs (member_id, admin_action, previous_state, new_state)
VALUES (NEW.id, 'INSERT', null, to_jsonb(NEW));
ELSIF TG_OP = 'UPDATE' THEN
INSERT INTO audit_logs (member_id, admin_action, previous_state, new_state)
VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
ELSIF TG_OP = 'DELETE' THEN
INSERT INTO audit_logs (member_id, admin_action, previous_state, new_state)
VALUES (OLD.id, 'DELETE', to_jsonb(OLD), null);
END IF;
RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_member_ministry_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid;
  v_action text;
  v_previous jsonb;
  v_new jsonb;
  v_changed boolean := true;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_member_id := NEW.member_id;
    v_action := 'Ministry Added';
    v_previous := NULL;
    v_new := to_jsonb(NEW) || jsonb_build_object(
      'entity_type', 'member_ministry',
      'membership_id', NEW.id
    );

  ELSIF TG_OP = 'DELETE' THEN
    v_member_id := OLD.member_id;
    v_action := 'Ministry Removed';
    v_previous := to_jsonb(OLD) || jsonb_build_object(
      'entity_type', 'member_ministry',
      'membership_id', OLD.id
    );
    v_new := NULL;

  ELSE
    v_member_id := NEW.member_id;
    v_action := 'Ministry Update';

    -- Ignore updates that only touch timestamps or rewrite identical business data.
    v_changed :=
      OLD.ministry IS DISTINCT FROM NEW.ministry OR
      OLD.status IS DISTINCT FROM NEW.status OR
      OLD.start_date IS DISTINCT FROM NEW.start_date OR
      OLD.expiration_date IS DISTINCT FROM NEW.expiration_date OR
      OLD.renewal_date IS DISTINCT FROM NEW.renewal_date OR
      OLD.document_url IS DISTINCT FROM NEW.document_url OR
      OLD.document_uploaded_at IS DISTINCT FROM NEW.document_uploaded_at OR
      OLD.archived_documents IS DISTINCT FROM NEW.archived_documents;

    IF NOT v_changed THEN
      RETURN NEW;
    END IF;

    v_previous := to_jsonb(OLD) || jsonb_build_object(
      'entity_type', 'member_ministry',
      'membership_id', OLD.id
    );
    v_new := to_jsonb(NEW) || jsonb_build_object(
      'entity_type', 'member_ministry',
      'membership_id', NEW.id
    );
  END IF;

  INSERT INTO public.audit_logs (
    member_id,
    admin_action,
    previous_state,
    new_state,
    timestamp
  )
  VALUES (
    v_member_id,
    v_action,
    v_previous,
    v_new,
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_log_member_ministry_changes AFTER INSERT OR DELETE OR UPDATE ON public.member_ministries FOR EACH ROW EXECUTE FUNCTION log_member_ministry_changes();
CREATE TRIGGER trg_pr55_ministry_one_year BEFORE INSERT OR UPDATE ON public.member_ministries FOR EACH ROW EXECUTE FUNCTION registry_private.enforce_member_ministry_year_v1();
CREATE TRIGGER trg_touch_member_ministries_updated_at BEFORE UPDATE ON public.member_ministries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_assign_member_uid BEFORE INSERT ON public.members FOR EACH ROW EXECUTE FUNCTION assign_member_uid();
CREATE TRIGGER trg_log_member_changes AFTER INSERT OR DELETE OR UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION log_member_changes();

-- Match the Data API security posture, but only synthetic authenticated users.
DO $qa$
DECLARE t text;
BEGIN
 FOR t IN SELECT unnest(ARRAY['members','member_ministries','import_batches','duplicate_flags','audit_logs']) LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $qa$;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.members,public.member_ministries,public.import_batches TO authenticated;
-- Local policy only, not a copy of Production's legacy email allowlist:
CREATE POLICY qa_admin_members_read ON public.members FOR SELECT TO authenticated USING (public.registration_is_admin());
CREATE POLICY qa_admin_ministries_read ON public.member_ministries FOR SELECT TO authenticated USING (public.registration_is_admin());
CREATE POLICY qa_admin_batches_read ON public.import_batches FOR SELECT TO authenticated USING (public.registration_is_admin());
