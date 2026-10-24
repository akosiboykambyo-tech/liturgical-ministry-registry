-- ISOLATED STAGING ONLY. Review disposition and immutable event audit.
-- No public table access and no production migration.
BEGIN;
CREATE TABLE IF NOT EXISTS registry_private.registration_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL REFERENCES registry_private.registration_intake_reviews(id),
 actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('approved','dismissed')),
 note text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(review_id)
);
REVOKE ALL ON registry_private.registration_review_events FROM PUBLIC,anon,authenticated;
ALTER TABLE registry_private.registration_review_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.registration_resolve_review_v1(
 p_review uuid,p_action text,p_note text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_status text;v_existing uuid;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS (
  SELECT 1 FROM registry_private.registration_administrators
  WHERE user_id=v_actor AND active AND revoked_at IS NULL
 ) THEN RAISE EXCEPTION 'Registration not authorized' USING ERRCODE='42501'; END IF;
 IF p_review IS NULL OR p_action IS NULL OR p_action NOT IN ('approved','dismissed')
  OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 5 AND 1000 THEN
  RAISE EXCEPTION 'Invalid review disposition' USING ERRCODE='22023'; END IF;
 SELECT status,existing_member_id INTO v_status,v_existing
 FROM registry_private.registration_intake_reviews WHERE id=p_review FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
 IF v_status <> 'pending' THEN
  RAISE EXCEPTION 'Review already resolved' USING ERRCODE='23505'; END IF;
 -- Approval is a decision to recognize the duplicate candidate, NOT an automatic
 -- mutation or merge into the existing member. A separate validated merge workflow
 -- is required for any ministry changes.
 UPDATE registry_private.registration_intake_reviews SET status=p_action WHERE id=p_review;
 INSERT INTO registry_private.registration_review_events(review_id,actor_id,action,note)
 VALUES(p_review,v_actor,p_action,btrim(p_note));
 RETURN jsonb_build_object('status',p_action,'reviewId',p_review,'existingMemberId',v_existing);
END;$fn$;
REVOKE ALL ON FUNCTION public.registration_resolve_review_v1(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
