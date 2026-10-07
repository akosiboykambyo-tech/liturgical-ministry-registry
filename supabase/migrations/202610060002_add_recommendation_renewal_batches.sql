-- Add durable parish/ministry batch recommendation renewal history and a
-- transactional RPC that renews exact member_ministries rows.
--
-- The uploaded recommendation letter may be shared by many membership rows.
-- Individual membership history is snapshotted here before each renewal.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recommendation_renewal_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish text NOT NULL,
  ministry text,
  document_url text NOT NULL,
  document_uploaded_at timestamptz NOT NULL DEFAULT now(),
  renewal_date date NOT NULL,
  next_renewal_date date NOT NULL,
  notes text,
  processed_by uuid,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_renewal_batches_dates_check
    CHECK (next_renewal_date >= renewal_date)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_batches_parish
  ON public.recommendation_renewal_batches (parish);

CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_batches_ministry
  ON public.recommendation_renewal_batches (ministry)
  WHERE ministry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_batches_processed_at
  ON public.recommendation_renewal_batches (processed_at DESC);

CREATE TABLE IF NOT EXISTS public.recommendation_renewal_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL
    REFERENCES public.recommendation_renewal_batches(id) ON DELETE CASCADE,
  member_ministry_id uuid
    REFERENCES public.member_ministries(id) ON DELETE SET NULL,
  member_id uuid
    REFERENCES public.members(id) ON DELETE SET NULL,
  member_uid text NOT NULL,
  member_name text NOT NULL,
  parish text NOT NULL,
  ministry text NOT NULL,
  previous_status varchar(30),
  previous_start_date date,
  previous_expiration_date date,
  previous_renewal_date date,
  previous_document_url text,
  result_status varchar(30) NOT NULL DEFAULT 'Renewed'
    CHECK (result_status IN ('Pending Verification', 'New', 'Renewed', 'Inactive')),
  result_expiration_date date NOT NULL,
  result_renewal_date date NOT NULL,
  result_document_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_renewal_memberships_previous_status_check
    CHECK (
      previous_status IS NULL OR
      previous_status IN ('Pending Verification', 'New', 'Renewed', 'Inactive')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_batch_membership
  ON public.recommendation_renewal_memberships (batch_id, member_ministry_id)
  WHERE member_ministry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_batch_id
  ON public.recommendation_renewal_memberships (batch_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_member_id
  ON public.recommendation_renewal_memberships (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recommendation_renewal_memberships_member_ministry_id
  ON public.recommendation_renewal_memberships (member_ministry_id)
  WHERE member_ministry_id IS NOT NULL;

ALTER TABLE public.recommendation_renewal_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_renewal_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_recommendation_renewal_batches"
  ON public.recommendation_renewal_batches;

CREATE POLICY "authenticated_select_recommendation_renewal_batches"
ON public.recommendation_renewal_batches
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "authenticated_select_recommendation_renewal_memberships"
  ON public.recommendation_renewal_memberships;

CREATE POLICY "authenticated_select_recommendation_renewal_memberships"
ON public.recommendation_renewal_memberships
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.process_recommendation_renewal_batch(
  p_batch_id uuid,
  p_parish text,
  p_ministry text,
  p_document_url text,
  p_renewal_date date,
  p_next_renewal_date date,
  p_membership_ids uuid[],
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_expected integer;
  v_found integer;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch id is required.';
  END IF;

  IF NULLIF(btrim(p_parish), '') IS NULL THEN
    RAISE EXCEPTION 'Parish is required.';
  END IF;

  IF NULLIF(btrim(p_document_url), '') IS NULL THEN
    RAISE EXCEPTION 'Recommendation letter document is required.';
  END IF;

  IF p_renewal_date IS NULL OR p_next_renewal_date IS NULL THEN
    RAISE EXCEPTION 'Renewal date and next renewal date are required.';
  END IF;

  IF p_next_renewal_date < p_renewal_date THEN
    RAISE EXCEPTION 'Next renewal date cannot be earlier than renewal date.';
  END IF;

  SELECT array_agg(DISTINCT membership_id)
  INTO v_ids
  FROM unnest(COALESCE(p_membership_ids, ARRAY[]::uuid[])) AS membership_id;

  v_expected := COALESCE(cardinality(v_ids), 0);

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Select at least one ministry membership.';
  END IF;

  SELECT count(*)
  INTO v_found
  FROM public.member_ministries AS mm
  JOIN public.members AS m
    ON m.id = mm.member_id
  WHERE mm.id = ANY(v_ids)
    AND m.parish = p_parish
    AND (
      NULLIF(btrim(p_ministry), '') IS NULL
      OR mm.ministry = p_ministry
    );

  IF v_found <> v_expected THEN
    RAISE EXCEPTION
      'One or more selected memberships do not belong to the requested parish/ministry scope.';
  END IF;

  INSERT INTO public.recommendation_renewal_batches (
    id,
    parish,
    ministry,
    document_url,
    document_uploaded_at,
    renewal_date,
    next_renewal_date,
    notes,
    processed_by,
    processed_at
  )
  VALUES (
    p_batch_id,
    btrim(p_parish),
    NULLIF(btrim(p_ministry), ''),
    p_document_url,
    v_now,
    p_renewal_date,
    p_next_renewal_date,
    NULLIF(btrim(p_notes), ''),
    auth.uid(),
    v_now
  );

  INSERT INTO public.recommendation_renewal_memberships (
    batch_id,
    member_ministry_id,
    member_id,
    member_uid,
    member_name,
    parish,
    ministry,
    previous_status,
    previous_start_date,
    previous_expiration_date,
    previous_renewal_date,
    previous_document_url,
    result_status,
    result_expiration_date,
    result_renewal_date,
    result_document_url
  )
  SELECT
    p_batch_id,
    mm.id,
    m.id,
    m.uid,
    btrim(concat_ws(' ', m.first_name, m.last_name)),
    m.parish,
    mm.ministry,
    mm.status,
    mm.start_date,
    mm.expiration_date,
    mm.renewal_date,
    mm.document_url,
    'Renewed',
    p_next_renewal_date,
    p_renewal_date,
    p_document_url
  FROM public.member_ministries AS mm
  JOIN public.members AS m
    ON m.id = mm.member_id
  WHERE mm.id = ANY(v_ids);

  UPDATE public.member_ministries AS mm
  SET
    archived_documents =
      CASE
        WHEN mm.document_url IS NULL THEN COALESCE(mm.archived_documents, '[]'::jsonb)
        ELSE
          COALESCE(mm.archived_documents, '[]'::jsonb) ||
          jsonb_build_array(
            jsonb_build_object(
              'document_url', mm.document_url,
              'uploaded_at', mm.document_uploaded_at,
              'archived_at', v_now,
              'expiration_date', mm.expiration_date,
              'ministry', mm.ministry
            )
          )
      END,
    status = 'Renewed',
    renewal_date = p_renewal_date,
    expiration_date = p_next_renewal_date,
    document_url = p_document_url,
    document_uploaded_at = v_now
  WHERE mm.id = ANY(v_ids);

  RETURN p_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_recommendation_renewal_batch(
  uuid, text, text, text, date, date, uuid[], text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_recommendation_renewal_batch(
  uuid, text, text, text, date, date, uuid[], text
) TO authenticated;

COMMIT;
