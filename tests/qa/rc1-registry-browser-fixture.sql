-- Local browser-only Registry fixtures. Run exclusively against the disposable
-- Supabase CLI database; all names are synthetic. Never link a remote project.
\set ON_ERROR_STOP on
CREATE TABLE IF NOT EXISTS public.members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 uid text UNIQUE, first_name text NOT NULL, last_name text NOT NULL,
 parish text NOT NULL, ministries text[] DEFAULT '{}',
 service_year integer DEFAULT 2026, status text DEFAULT 'Pending Verification',
 notes text
);
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.members TO authenticated;
CREATE POLICY qa_registry_members_read ON public.members FOR SELECT TO authenticated
USING ((SELECT public.registration_is_admin()));
CREATE TABLE IF NOT EXISTS public.import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_hash text,
 file_name text, created_at timestamptz DEFAULT now(),
 unique_inserted integer DEFAULT 0, duplicates_routed integer DEFAULT 0,
 status text DEFAULT 'done', row_count integer DEFAULT 0
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.import_batches TO authenticated;
CREATE POLICY qa_registry_batches_read ON public.import_batches FOR SELECT TO authenticated
USING ((SELECT public.registration_is_admin()));
INSERT INTO public.members(uid,first_name,last_name,parish,ministries)
SELECT 'SYNTH-'||g::text, 'Synthetic'||g::text,'Example'||g::text,
'San Lorenzo & Companion Martyrs Parish', ARRAY['Ministry of Liturgical Music']
FROM generate_series(1,1000) AS g;
INSERT INTO public.members(uid,first_name,last_name,parish,ministries)
VALUES ('SYNTH-1001','Jonatan','Santos',
'San Lorenzo & Companion Martyrs Parish', ARRAY['Ministry of Liturgical Music']);
NOTIFY pgrst, 'reload schema';
