-- ISOLATED STAGING ONLY. Tests the two additional production renewal
-- invariant constraints in TEMP tables; no public renewal tables are installed.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
 OR (SELECT count(*) FROM public.members) <> 1008
 OR (SELECT count(*) FROM public.member_ministries) <> 12
 OR to_regprocedure('registry_private.enforce_member_ministry_year_v1()') IS NULL
 THEN RAISE EXCEPTION 'Wrong environment for temporary renewal constraints' USING ERRCODE='42501';
 END IF;
END $guard$;

CREATE TEMP TABLE pr55_batch_year_lab(
 renewal_date date NOT NULL,
 next_renewal_date date NOT NULL,
 CONSTRAINT pr55_lab_batch_dates
 CHECK (next_renewal_date = (renewal_date + interval '1 year')::date)
) ON COMMIT DROP;

CREATE TEMP TABLE pr55_renewal_history_lab(
 result_status text NOT NULL,
 result_renewal_date date NOT NULL,
 result_expiration_date date NOT NULL,
 CONSTRAINT pr55_lab_snapshot_year
 CHECK (result_status <> 'Renewed' OR
   result_expiration_date = (result_renewal_date + interval '1 year')::date)
) ON COMMIT DROP;

DO $tests$
DECLARE v_rejected boolean;
BEGIN
 INSERT INTO pg_temp.pr55_batch_year_lab VALUES(date '2026-10-29',date '2027-10-29');
 INSERT INTO pg_temp.pr55_batch_year_lab VALUES(date '2028-02-29',date '2029-02-28');
 INSERT INTO pg_temp.pr55_renewal_history_lab VALUES('Renewed',date '2028-02-29',date '2029-02-28');

 v_rejected:=false;
 BEGIN
  INSERT INTO pg_temp.pr55_batch_year_lab VALUES(date '2026-10-29',date '2027-10-28');
 EXCEPTION WHEN check_violation THEN v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'Shorter-than-year batch accepted'; END IF;

 v_rejected:=false;
 BEGIN
  INSERT INTO pg_temp.pr55_batch_year_lab VALUES(date '2026-10-29',date '2027-10-30');
 EXCEPTION WHEN check_violation THEN v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'Longer-than-year batch accepted'; END IF;

 v_rejected:=false;
 BEGIN
  INSERT INTO pg_temp.pr55_renewal_history_lab VALUES('Renewed',date '2028-02-29',date '2029-03-01');
 EXCEPTION WHEN check_violation THEN v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid renewed snapshot accepted'; END IF;

 v_rejected:=false;
 BEGIN
  UPDATE pg_temp.pr55_renewal_history_lab
  SET result_expiration_date=date '2029-03-01';
 EXCEPTION WHEN check_violation THEN v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid snapshot edit accepted'; END IF;

 INSERT INTO pg_temp.pr55_renewal_history_lab VALUES('Inactive',date '2026-10-29',date '2026-11-01');
END
$tests$;
SELECT 'PASS: exact-year batch dates and Renewed snapshot constraints incl leap clamp; short/long invalid rows and updates rejected; all TEMP data rolled back' AS result;
ROLLBACK;