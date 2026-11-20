# PR79 Certificate Studio persistence and TEST recovery — 12 November 2026

## Root cause (verified against both Supabase projects)

- Vercel PR79 Preview uses `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`), not the live `Ministry-Database` (`zlvofcwnpdzfdnipvbbd`).
- Production had `certificate_template_2026-renewal` and `certificate_template_2027-renewal` (2027 default), 36 certificate-templates Storage objects and eight signatory records.
- TEST had **zero** `certificate_template%` rows, zero signatories and one newly uploaded background object. That TEST background object was kept.
- TEST `authenticated` was granted SELECT on `system_settings` and `signatories`, but not INSERT/UPDATE/DELETE. RLS had SELECT-only policies. An image could upload while the corresponding template save failed.
- Both Production templates had a legacy `background_data_url` JSON string around 8,983,592 characters; `template_url` is the field actually rendered in `lib/certificate.ts` and Certificate Studio. The 9 MB embedded backup was redundant and dramatically slowed template read.

## Corrective actions taken in TEST only

- Applied migration `pr79_test_certificate_studio_admin_write_rls`, source in `docs/sql/pr79-test-certificate-studio-admin-write-rls.APPLIED.sql`. DML remains restricted by revocable `registration_is_admin()`; `system_settings` writes are limited to `certificate_template%` and `sig_layout_%` keys; signatories writes require active registered admin.
- Restored two saved Production certificate designs as **independent TEST metadata rows**, excluding only the unused `background_data_url` property. Original Production rows, embedded backups and Storage objects remain entirely untouched.
- Restored eight matching signatory metadata records in TEST using original IDs to preserve certificate signatory-slot references. No Production member records were copied.
- The TEST designs temporarily **reference existing public Production background/font/signature object URLs** (read-only). This recovers layout and assets without reuploading, but it is not a fully self-contained TEST Storage backup. Prior to any production-cutover certification, independently copy required public assets into TEST Storage and rewrite TEST URLs, then verify font, QR, signatories and full-sized print.
- No existing TEST Storage objects were overwritten or deleted, and no new certificate files were uploaded by the recovery.

## Application hardening

- `Save Template` now requires the database to return the exact saved key before showing success, including zero-row update detection.
- Certificate Studio describes which Supabase environment holds its templates. When an environment has no saved templates, it explains that the other database's designs are not necessarily lost.
- Template save removes the unused `background_data_url` legacy field, retaining the Storage `template_url` as the sole background source to avoid recurring multi-MB loads.
- Changes are restricted to draft PR79. Production is unchanged.

## Remaining gates

- Real administrator session must confirm saved-template list, same design and signatories, edit + save + reload, preview and full-resolution print.
- Negative signed-JWT test: ordinary authenticated users and anon cannot write settings or signatories.
- TEST public asset links and fonts must be checked for availability and appropriate CORS. A complete independent TEST Storage mirror and rollback playbook remain pending.
- PR79 is still DRAFT / NO-GO for production.
