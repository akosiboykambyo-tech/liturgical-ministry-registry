# PR55 — Server-side one-year renewal enforcement, staging evidence

**Date:** 2026-10-29. **Production status: NO-GO.**

## Rule and source of dates

Every **New** ministry assignment must have `expiration_date = start_date + INTERVAL '1 year'`. Every **Renewed** ministry assignment must have `expiration_date = renewal_date + INTERVAL '1 year'`. PostgreSQL calendar-year arithmetic clamps **2028-02-29 → 2029-02-28**. This preserves the separate status/expiry of each ministry assignment rather than promoting all ministries at once.

A renewal batch retains the existing eight-argument RPC interface for backward compatibility. The proposed hardened server function computes `v_expires` from the requested `p_renewal_date` and rejects any `p_next_renewal_date` that does not match exactly. It additionally rejects future-dated renewals, duplicate IDs, zero/over-100 selections, outside-scope assignments and pending/unverified ministries; it serializes member/ministry locks and requires an active revocable administrator grant. Historical batch dates remain possible (and must be administratively audited); **this is not yet an independent proof that the operator-entered renewal date matches the real-world ceremony/document date**. A stricter server-generated event-date policy would be a separate product decision.

## Isolated staging: verified

1. Migration `pr55_staging_one_year_membership_invariant_20261029` was installed **only** in `Ministry-Registry-Test`. It places a **SECURITY INVOKER** trigger function in `registry_private` and a `BEFORE INSERT OR UPDATE` trigger on `public.member_ministries`. The trigger enforces the year on every newly created active row and on every **changed** status/start/renewal/expiration field. It doesn't rewrite historical records.
2. A `BEGIN ... ROLLBACK` test created a synthetic minister, rejected an invalid New expiration, accepted exact-year New, rejected an invalid New update, accepted an exact-year New→Renewed transition, rejected an invalid renewal-date edit/missing anchor, accepted leap-day New and rejected off-by-one leap expiry. A document-path-only update succeeded. No synthetic records persisted.
3. Staging does **not** have production's `recommendation_renewal_batches` or `recommendation_renewal_memberships` tables. The equivalent two one-year constraints were exercised in `TEMP` tables inside a rollback-only transaction: exact-year rows and leap-day clamps passed, short/long invalid dates and altered history were rejected.
4. The production-style eight-argument renewal batch function was transformed **only by schema qualification** into a `registry_renewal_lab` schema created inside a single `BEGIN ... ROLLBACK` staging transaction, with production-like member/assignment/batch/history columns and constraints. The rehearsal passed: authorized renewal creates exactly one batch/history snapshot and changes only the selected ministry; another pending ministry and member compatibility summary stay Pending Verification. Tampered next date, pending member assignment, duplicate IDs and nonadmin access were denied. A historical short-validity Renewed row permitted metadata editing but rejected changing its validity dates to another invalid tuple. The entire lab transaction rolled back, leaving no permanent lab schema or rows.

## Current production read-only preflight

Production contains **two Renewed ministry assignments**, **one with a shorter-than-one-calendar-year expiration** (both date fields present), and zero renewal batches at the observed preflight. A `NOT VALID` CHECK skips historical *validation* but still affects later updates to those rows. Consequently, a blanket row-wide NOT VALID check on `member_ministries` is inappropriate before the exception is reviewed. The proposed trigger evaluates only newly created active rows and changes to their validity tuple, allowing unrelated metadata updates to existing exceptional rows, while never silently changing their expiry.

The current production `check_renewal_admin_access` checks a fixed JWT email; the revocable `registry_private.registration_administrators` table is **absent in production**. Production also grants broad table privileges to `anon` / `authenticated` on renewal history tables and exposes unaudited legacy client write paths. These must be reviewed and closed with a separate, approved access-control migration before any new server enforcement or frontend activation.

## Files and gates

- `docs/sql/pr55-staging-one-year-ministry-guard.INSTALL-ISOLATED-ONLY.sql`: **installed staging only**, tested against canonical staging table.
- `docs/sql/pr55-staging-renewal-constraint-lab.ROLLBACK-ONLY.sql`: schema-equivalent temporary batch/history constraint tests.
- `docs/sql/pr55-staging-renewal-batch-lab.ROLLBACK-ONLY.sql`: transaction-only eight-argument hardened batch function and role tests.
- `docs/sql/pr55-production-one-year-ministry-validity.REVIEW-ONLY.sql`: deliberately throws immediately; future production trigger and constraints **not deployable yet**.
- `docs/sql/pr55-production-hardened-renewal-batch.REVIEW-ONLY.sql`: deliberately throws immediately; future production administrator-gated RPC **not deployable yet**.

**Next barriers:** review the existing short-validity production record and policy for backdated renewals, install/seed/audit the revocable production administrator allowlist and close legacy direct write privileges, certify a full production-fidelity restore rehearsal, validate a production-schema exact migration and roll-forward/rollback under formal approval, and only then choose when to enable the frontend feature.

Do not merge either draft PR or change `cowl-dok.online` / production Supabase as part of this staging test.
