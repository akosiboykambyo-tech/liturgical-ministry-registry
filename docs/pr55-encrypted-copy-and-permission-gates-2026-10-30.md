# PR55 — second encrypted-copy recovery proof and production security baseline
**2026-10-30 | Review only; NO live writes or merge**

## Operator-proven recovery
- Fresh October 30 PostgreSQL 17 database archive restored successfully offline into a disposable PG17 database: 1 member, 2 assignments, 1 Auth user, 37 Storage metadata records.
- Local database AES-256-GCM archive authenticated and verified in memory against recorded SHA256.
- All 37 current Storage object bytes downloaded, individually matched original SHA256 manifest, ZIP created and validated, encrypted Storage archive independently authenticated.
- D: copies of both encrypted archives match source SHA256, but both drives are on the same PC. No independent off-device copy exists yet.

## New optional proof (not yet operator-run)
- The paired `scripts/pr55-verify-encrypted-recovery-copy.ps1` and `scripts/pr55-verify-encrypted-recovery-copy.cjs` run entirely offline against the D:-stored encrypted second-copy files.
- Requires the EXISTING two encryption passphrases, entered through Windows credentials dialogs. Refuses ambiguous backup-set folders, incorrect paths, missing keys, unexpected objects, incorrect source ciphertext hashes, wrong passwords or forged/tampered GCM tags.
- Proves the *second copy* decrypts to the exact prior verified database archive and Storage ZIP SHA256, **without writing recovered plaintext to disk**. Only anonymous PASS/NO-GO/LIMIT lines are shown.
- Uses bounded memory for this ~18 MB database archive and ~37 MB Storage ZIP. Test utilities exercise both GCM formats using synthetic data and reject tampering. PowerShell script is syntax-checked in Windows CI; no secrets or real data are used there.

### Operator command (Windows PowerShell)
After updating PR55 checkout, from the repository folder:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pr55-verify-encrypted-recovery-copy.ps1
```
Use the existing database and Storage encryption passphrases (not Supabase credentials). Send only PASS/NO-GO/LIMIT outputs.

## Live read-only October 30 production authorization audit
- `registry_private.registration_administrators` **does not exist**; administrator identity and revocable grant are not certified.
- `authenticated` still has effective SQL INSERT and DELETE on `public.members`, and UPDATE on `public.member_ministries`, alongside legacy fixed-user RLS restrictions. Privileges alone do not prove effective access without RLS.
- `public.log_member_ministry_changes()` is SECURITY DEFINER and EXECUTE is effectively available to both `anon` and `authenticated`.
- `public.process_recommendation_renewal_batch(...)` is SECURITY DEFINER and EXECUTE effectively available to `authenticated` but not `anon`.
- Supabase's read-only security advisor still flags these functions, disabled leaked-password protection, and five INFO RLS-with-no-policy items. No configuration or data was changed.

## Open release gates
1. Create and SHA256 verify an encrypted *off-device* copy on a separate approved USB drive or secure organization-managed backup destination. D: on the same PC is not independent recovery.
2. Restore the encrypted backups using a protected-copy end-to-end rehearsal that verifies functional Supabase Auth login and private Storage reads (the current standalone PG17 container cannot establish these).
3. Faithfully restore roles, grants, ownership and ACLs using a supported Supabase restore process. The earlier `--no-owner --no-acl` restore **cannot** certify permission parity.
4. Review and approve real administrator identity, secure privilege cutover, one-year validity/letter data exceptions, and legacy write-path migration. Execute security changes only through an approved staged rollback sequence.
5. Re-run access-denial tests, secure admin browser flows and security advisors; obtain explicit release authorization before merging PR55 and PR56.

**Release NO-GO; all test work is offline/read-only.**
