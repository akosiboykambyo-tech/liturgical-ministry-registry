-- ISOLATED STAGING ONLY: rtptybxugjhvpfjvcvgw. No production use.
-- Canonical names copied from lib/constants.ts, 2026-10-24.
BEGIN;
CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS registry_private.registration_allowed_ministries (
 name text PRIMARY KEY
);
REVOKE ALL ON TABLE registry_private.registration_allowed_ministries FROM PUBLIC, anon, authenticated;
ALTER TABLE registry_private.registration_allowed_ministries ENABLE ROW LEVEL SECURITY;
DO $verify$
BEGIN
 IF EXISTS (SELECT 1 FROM registry_private.registration_allowed_ministries
    WHERE name NOT IN (
      'Mother Butler Guild',
      'Ministry of Greeters and Collectors',
      'Extraordinary Ministers of Holy Communion',
      'Ministry of Lectors and Commentators',
      'Ministry of Liturgical Music',
      'Ministry of Altar Servers'
    )) THEN
  RAISE EXCEPTION 'Unexpected existing ministry — refusing seed';
 END IF;
END;
$verify$;
INSERT INTO registry_private.registration_allowed_ministries(name) VALUES
 ('Mother Butler Guild'),
 ('Ministry of Greeters and Collectors'),
 ('Extraordinary Ministers of Holy Communion'),
 ('Ministry of Lectors and Commentators'),
 ('Ministry of Liturgical Music'),
 ('Ministry of Altar Servers')
ON CONFLICT(name) DO NOTHING;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM registry_private.registration_allowed_ministries) <> 6 THEN
  RAISE EXCEPTION 'Expected exactly six canonical ministries';
 END IF;
END;
$verify$;
COMMIT;