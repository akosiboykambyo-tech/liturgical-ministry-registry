# RC1 settings-privacy remediation — staged rollout

**Date:** 2026-11-20 (Asia/Manila)  
**Scope:** Draft RC1 source; Ministry-Registry-Test only for eventual execution. Production remains untouched.

## What the audit actually proved

- TEST `pr55_stage_public_read_system_settings` allows anonymous read of all nine settings, including two certificate-design template rows and seven signature-layout coordinate rows.
- The public `/verify` page reads the currently default `certificate_template%` row and all `sig_layout_%` rows for printed public certificate rendering.
- `registry-header` and `public-maintenance-gate` read only `public_marquee` and `public_maintenance`.
- Registry Certificate Studio and admin member drawer need full template/layout access. A blanket policy drop before app updates would be a regression.
- Metadata-only review showed one default certificate template and one nondefault draft; seven signatory-layout rows have x/y/scale only. Template settings have visual fields and URLs. **Confidentiality of template assets, URLs and signatory images still requires owner classification.**

## Source changes staged in Draft PR #88

1. `GET /api/verify/certificate-design` returns only the default published template and normalized signatory layout coordinates; it uses server-only `SUPABASE_SERVICE_ROLE_KEY`, never takes a dynamic settings key, and does not return private member records or raw settings rows.
2. Public `/verify` renders the published design from that fixed endpoint. Existing fallback for unavailable design remains.
3. `docs/sql/rc1-system-settings-privacy.CANDIDATE.sql` narrows anonymous and non-Registry reads to `public_marquee` and `public_maintenance`; Registry administrators can still read/edit certificate/template settings and upsert public-site settings. The script **has not been applied**.
4. Regression tests assert that public `/verify` no longer directly selects from `system_settings`, the route is limited, and the candidate SQL keeps both public site-control keys.

## Controlled rollout order / release gates

1. **Before applying SQL:** recheck Preview branch TEST URL, publishable key and service-role key origin. Validate endpoint 200 (or diagnose 503) and `/verify` visual certificate in TEST. Check public asset URLs and signatory rendering.
2. Record a schema-only RLS/policy snapshot (names, expressions, grants) and confirm the enclosed rollback SQL is correct for that TEST snapshot. Obtain explicit approval to execute TEST RLS changes.
3. Apply **candidate** in TEST only and validate anonymous, COWL, Curia, revoked, and Registry-admin RLS access plus both Public Website editor upserts and Certificate Studio. Use disposable TEST fixtures for writes; record prior state and restore it.
4. Verify real signed-token API/Storage denial separately (no tokens in logs/reports). Review the ten SECURITY DEFINER RPCs, especially authorization before DML. The database-role simulations are not signed HTTP evidence.
5. Only after TEST acceptance and management approval: create a numbered migration using the Supabase CLI, review Production parity and backup/rollback, and schedule Production migration **after** compatible application code deployment.

## Stop conditions

- Public `/verify` loses the published design or renders incorrect signatures.
- Any COWL, Curia, no-grant, revoked or anonymous session can query certificate draft settings directly.
- The server-only service-role secret is exposed to client JS.
- Preview environment does not point exclusively to TEST.
- The site editor loses the ability to manage public announcements/maintenance.

**Current status:** Source mitigation is staged for review; database privacy finding remains **OPEN** until TEST policy execution and explicit verification. No permission grants or production deployment changes are authorized.
