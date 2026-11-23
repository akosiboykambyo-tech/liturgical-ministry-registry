-- COWL-DOK Staff and Access / REVIEW ONLY
-- Never apply to Production without signed security approval, TEST rehearsal,
-- and a fresh recoverable backup. Existing data and grants are unchanged.
-- A separate, intentionally assigned platform_provisioner grant is required
-- in addition to the existing active Registry Administrator authorization.
BEGIN;

CREATE TABLE registry_private.staff_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  role_code text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 12 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_access_events_target_time_idx
  ON registry_private.staff_access_events (target_user_id, occurred_at DESC);
REVOKE ALL ON registry_private.staff_access_events FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.staff_access_authorized_v1(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT p_actor IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM registry_private.registration_administrators r
      WHERE r.user_id = p_actor AND r.active AND r.revoked_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.fs_staff_grants g
      WHERE g.user_id = p_actor
        AND g.role_code = 'platform_provisioner'
        AND g.revoked_at IS NULL
        AND g.granted_at <= now()
        AND (g.expires_at IS NULL OR g.expires_at > now())
    );
$fn$;

CREATE FUNCTION public.staff_access_roster_v1(p_actor uuid)
RETURNS TABLE (
  user_id uuid, role_code text, active boolean,
  granted_at timestamptz, expires_at timestamptz, revoked_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF NOT public.staff_access_authorized_v1(p_actor) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT r.user_id, 'registry_administrator'::text,
      (r.active AND r.revoked_at IS NULL), r.granted_at,
      NULL::timestamptz, r.revoked_at
    FROM registry_private.registration_administrators r
    UNION ALL
    SELECT g.user_id, g.role_code,
      (g.revoked_at IS NULL AND g.granted_at <= now()
        AND (g.expires_at IS NULL OR g.expires_at > now())),
      g.granted_at, g.expires_at, g.revoked_at
    FROM public.fs_staff_grants g
    WHERE g.role_code IN (
      'cowl_financial_workspace_viewer','curia_financial_workspace_viewer'
    );
END;
$fn$;

CREATE FUNCTION public.staff_access_change_v1(
  p_actor uuid, p_target uuid, p_action text, p_role text, p_reason text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.staff_access_authorized_v1(p_actor) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_target IS NULL OR p_actor = p_target
     OR p_action NOT IN ('grant','revoke')
     OR p_role NOT IN ('registry_administrator',
       'cowl_financial_workspace_viewer','curia_financial_workspace_viewer')
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 12 AND 500
  THEN
    RAISE EXCEPTION 'STAFF_ACCESS_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_TARGET_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  -- Serialize concurrent changes to the same user/role, and serialize
  -- all Registry-admin changes to preserve the last active administrator.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_target::text || ':' || p_role, 0
  ));
  IF p_role = 'registry_administrator' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(73531, 2026);
    IF p_action = 'grant' THEN
      IF EXISTS (
        SELECT 1 FROM registry_private.registration_administrators
        WHERE user_id = p_target AND active AND revoked_at IS NULL
      ) THEN
        RAISE EXCEPTION 'STAFF_ACCESS_ROLE_ALREADY_ACTIVE' USING ERRCODE = '23505';
      END IF;
      INSERT INTO registry_private.registration_administrators
        (user_id,active,granted_at,revoked_at)
      VALUES (p_target,true,now(),NULL)
      ON CONFLICT (user_id) DO UPDATE
        SET active = true, granted_at = now(), revoked_at = NULL;
    ELSE
      SELECT count(*) INTO v_count
      FROM registry_private.registration_administrators
      WHERE active AND revoked_at IS NULL;
      IF v_count <= 1 THEN
        RAISE EXCEPTION 'STAFF_ACCESS_LAST_REGISTRY_ADMIN' USING ERRCODE = '23514';
      END IF;
      UPDATE registry_private.registration_administrators
      SET active = false, revoked_at = now()
      WHERE user_id = p_target AND active AND revoked_at IS NULL;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'STAFF_ACCESS_ROLE_NOT_ACTIVE' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    IF p_action = 'grant' THEN
      IF EXISTS (
        SELECT 1 FROM public.fs_staff_grants
        WHERE user_id = p_target AND role_code = p_role
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
      ) THEN
        RAISE EXCEPTION 'STAFF_ACCESS_ROLE_ALREADY_ACTIVE' USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.fs_staff_grants
        (user_id,role_code,granted_by,provisioning_method,authorization_reference)
      VALUES
        (p_target,p_role,p_actor,'staff_approved',btrim(p_reason));
    ELSE
      UPDATE public.fs_staff_grants
      SET revoked_at = now(), revoked_by = p_actor
      WHERE user_id = p_target AND role_code = p_role
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now());
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'STAFF_ACCESS_ROLE_NOT_ACTIVE' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  INSERT INTO registry_private.staff_access_events
    (actor_user_id,target_user_id,action,role_code,reason)
  VALUES (p_actor,p_target,p_action,p_role,btrim(p_reason));
  RETURN true;
END;
$fn$;

-- No browser role (authenticated/anon) can call provisioning functions.
REVOKE ALL ON FUNCTION public.staff_access_authorized_v1(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_access_roster_v1(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_access_change_v1(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_access_authorized_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_access_roster_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_access_change_v1(uuid,uuid,text,text,text)
  TO service_role;

COMMIT;
