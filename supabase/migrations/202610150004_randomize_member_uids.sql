
-- COWL-DOK: Cryptographically randomized Registry IDs
-- IMPORTANT: Prepare and review only. Do not execute yet.
--
-- Format: LMD-YYYY-XXXX-XXXX-XXXX
-- Excludes: 0, O, 1, I, L from the random characters.
--
-- Existing member UUIDs and ministry relationships are preserved.
-- Existing textual UID references are updated in one transaction.

BEGIN;

-- Lock member records during rotation to prevent concurrent
-- registrations or UID changes during the migration.
LOCK TABLE
  public.members,
  public.name_correction_requests,
  public.public_reports,
  public.recommendation_renewal_memberships
IN SHARE ROW EXCLUSIVE MODE;

-- 1. Replace the sequential UID generator.
CREATE OR REPLACE FUNCTION public.generate_member_uid(
  p_service_year integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

    WHILE length(v_random_part) < 12 LOOP
      v_byte := pg_catalog.get_byte(
        extensions.gen_random_bytes(1),
        0
      );

      -- Rejection sampling avoids modulo bias:
      -- 248 is divisible by the 31-character alphabet.
      IF v_byte < 248 THEN
        v_position := (v_byte % 31) + 1;

        v_random_part := v_random_part ||
          pg_catalog.substr(
            v_alphabet,
            v_position,
            1
          );
      END IF;
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
$function$;

-- Prevent direct anonymous calls to the generator.
REVOKE ALL ON FUNCTION
  public.generate_member_uid(integer)
FROM PUBLIC, anon;

-- The administrator's insert trigger needs this permission.
GRANT EXECUTE ON FUNCTION
  public.generate_member_uid(integer)
TO authenticated, service_role;

-- 2. Ensure new registrations always receive a generated UID.
-- Explicitly supplied sequential or manually chosen UIDs
-- will no longer bypass automatic generation.
CREATE OR REPLACE FUNCTION public.assign_member_uid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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
$function$;

-- 3. Build a temporary old-to-new UID mapping.
-- Nothing is written to existing member records yet.
CREATE TEMP TABLE uid_rotation_map (
  member_id uuid PRIMARY KEY,
  old_uid text NOT NULL UNIQUE,
  new_uid text NOT NULL UNIQUE
) ON COMMIT DROP;

DO $rotation$
DECLARE
  v_member record;
  v_new_uid text;
  v_attempt integer;
  v_total integer;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM public.members;

  IF v_total <> 7972 THEN
    RAISE EXCEPTION
      'Member count changed: expected 7972, found %',
      v_total;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.members
    WHERE uid IS NULL
       OR service_year IS NULL
       OR service_year NOT BETWEEN 1000 AND 9999
  ) THEN
    RAISE EXCEPTION
      'Member data failed pre-rotation validation';
  END IF;

  -- Prevent accidental execution after IDs were rotated.
  IF EXISTS (
    SELECT 1
    FROM public.members
    WHERE uid ~
      '^LMD-[0-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$'
  ) THEN
    RAISE EXCEPTION
      'Randomized Registry IDs already exist; review required';
  END IF;

  FOR v_member IN
    SELECT id, uid, service_year
    FROM public.members
    ORDER BY id
  LOOP
    v_new_uid := NULL;

    FOR v_attempt IN 1..100 LOOP
      v_new_uid := public.generate_member_uid(
        v_member.service_year
      );

      -- Prevent collisions within the temporary mapping.
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM uid_rotation_map
        WHERE new_uid = v_new_uid
      );

      v_new_uid := NULL;
    END LOOP;

    IF v_new_uid IS NULL THEN
      RAISE EXCEPTION
        'Unable to allocate a unique UID for member %',
        v_member.id;
    END IF;

    INSERT INTO uid_rotation_map (
      member_id,
      old_uid,
      new_uid
    )
    VALUES (
      v_member.id,
      v_member.uid,
      v_new_uid
    );
  END LOOP;

  IF (
    SELECT COUNT(*) FROM uid_rotation_map
  ) <> v_total THEN
    RAISE EXCEPTION
      'Incomplete Registry ID rotation mapping';
  END IF;
END;
$rotation$;

-- 4. Update dependent textual Registry ID references.
UPDATE public.name_correction_requests AS r
SET registry_id = map.new_uid
FROM uid_rotation_map AS map
WHERE r.registry_id = map.old_uid;

UPDATE public.public_reports AS r
SET registry_id = map.new_uid
FROM uid_rotation_map AS map
WHERE r.registry_id = map.old_uid;

UPDATE public.recommendation_renewal_memberships AS r
SET member_uid = map.new_uid
FROM uid_rotation_map AS map
WHERE r.member_uid = map.old_uid;

-- 5. Rotate the members' publicly displayed UIDs.
-- Internal member UUIDs remain unchanged.
UPDATE public.members AS m
SET uid = map.new_uid
FROM uid_rotation_map AS map
WHERE m.id = map.member_id;

-- 6. Enforce the new UID format at database level.
ALTER TABLE public.members
ADD CONSTRAINT members_randomized_uid_format_check
CHECK (
  uid IS NOT NULL
  AND uid ~
    '^LMD-[0-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$'
  AND substring(uid FROM 5 FOR 4) =
      service_year::text
);

-- 7. Verify rotation and dependent references.
DO $validation$
DECLARE
  v_total integer;
  v_matched integer;
  v_unmatched integer;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM public.members;

  SELECT COUNT(*)
  INTO v_matched
  FROM public.members AS m
  JOIN uid_rotation_map AS map
    ON map.member_id = m.id
   AND map.new_uid = m.uid;

  IF v_total <> 7972 OR v_matched <> v_total THEN
    RAISE EXCEPTION
      'Registry ID rotation validation failed';
  END IF;

  SELECT
    (
      SELECT COUNT(*)
      FROM public.name_correction_requests AS r
      LEFT JOIN public.members AS m
        ON m.uid = r.registry_id
      WHERE r.registry_id IS NOT NULL
        AND m.id IS NULL
    )
    +
    (
      SELECT COUNT(*)
      FROM public.public_reports AS r
      LEFT JOIN public.members AS m
        ON m.uid = r.registry_id
      WHERE r.registry_id IS NOT NULL
        AND m.id IS NULL
    )
    +
    (
      SELECT COUNT(*)
      FROM public.recommendation_renewal_memberships AS r
      LEFT JOIN public.members AS m
        ON m.uid = r.member_uid
      WHERE r.member_uid IS NOT NULL
        AND m.id IS NULL
    )
  INTO v_unmatched;

  IF v_unmatched <> 0 THEN
    RAISE EXCEPTION
      'Registry ID references contain % unmatched records',
      v_unmatched;
  END IF;

    -- Ensure no related record retains a pre-rotation Registry ID.
  IF EXISTS (
    SELECT 1
    FROM public.name_correction_requests AS r
    JOIN uid_rotation_map AS map
      ON r.registry_id = map.old_uid

    UNION ALL

    SELECT 1
    FROM public.public_reports AS r
    JOIN uid_rotation_map AS map
      ON r.registry_id = map.old_uid

    UNION ALL

    SELECT 1
    FROM public.recommendation_renewal_memberships AS r
    JOIN uid_rotation_map AS map
      ON r.member_uid = map.old_uid
  ) THEN
    RAISE EXCEPTION
      'Some related records still contain old Registry IDs';
  END IF;

    -- Confirm textual Registry IDs belong to the correct member UUID.
  IF EXISTS (
    SELECT 1
    FROM public.name_correction_requests AS r
    JOIN public.members AS m
      ON m.uid = r.registry_id
    WHERE r.member_id IS NOT NULL
      AND m.id <> r.member_id

    UNION ALL

    SELECT 1
    FROM public.public_reports AS r
    JOIN public.members AS m
      ON m.uid = r.registry_id
    WHERE r.member_id IS NOT NULL
      AND m.id <> r.member_id

    UNION ALL

    SELECT 1
    FROM public.recommendation_renewal_memberships AS r
    JOIN public.members AS m
      ON m.uid = r.member_uid
    WHERE r.member_id IS NOT NULL
      AND m.id <> r.member_id
  ) THEN
    RAISE EXCEPTION
      'Registry ID and member UUID relationships are inconsistent';
  END IF;

END;
$validation$;

COMMIT;
