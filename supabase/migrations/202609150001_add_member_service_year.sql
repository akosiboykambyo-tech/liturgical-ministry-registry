-- Add explicit service year to member records.
-- Existing years are derived from their current LMD-YYYY-#### UID.
-- UID generation remains database-side and sequential per service year.

ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS service_year integer;

-- Backfill existing members from their current UID.
UPDATE public.members
SET service_year = CAST(
  substring(uid FROM '^LMD-([0-9]{4})-[0-9]+$')
  AS integer
)
WHERE service_year IS NULL
  AND uid ~ '^LMD-[0-9]{4}-[0-9]+$';

-- Existing members should all have a valid year after the backfill.
ALTER TABLE public.members
ALTER COLUMN service_year SET NOT NULL;

-- The UID trigger is responsible for generating registry UIDs.
-- Do not allow a UUID to be silently generated as a fallback.
ALTER TABLE public.members
ALTER COLUMN uid DROP DEFAULT;
