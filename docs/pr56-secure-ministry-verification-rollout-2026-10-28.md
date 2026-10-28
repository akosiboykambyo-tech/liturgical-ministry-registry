# PR56 Secure Ministry Verification — gated integration (October 28, 2026)

This preview-only integration keeps the original `QuickScanMatrixPage` available by default. The secure replacement becomes visible **only when** `NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION=enabled` is explicitly set at build time. No Vercel setting is changed in this PR; this flag must remain unset in production.

## Behavior

- Reads pending `member_ministries` records with member identity instead of trusting only `members.status`.
- Administrator opens a minister, reviews individual ministry assignments, and explicitly checks only those with a ministry recommendation letter recorded.
- Calls `public.registry_verify_ministries_v1(member_id, membership_ids[], 'New')` once. The database must authorize the caller, lock and verify only selected assignments, set server-computed one-year expiry, and return the member's conservative summary.
- No optimistic writes, fallback to member-wide status updates, automatic selection, or bulk approvals. Renewals use the separate workflow, which must separately pass its release gates.
- Missing/unauthorized RPC and malformed response display errors and **do not** silently call legacy updates.

## Prerequisites before enabling the flag

1. PR55's reviewed RPC and admin allowlist must be installed through a separately approved, versioned, privilege-reviewed staging migration and verified with an authorized staging administrator.
2. The RPC requires assignment-specific recommendation letters to be stored in `member_ministries.document_url`; legacy member-level letter uploads do not satisfy this and require a documented migration or admin workflow adjustment.
3. Run actual Supabase HTTP/JWT tests using separate admin, non-admin, and anonymous accounts against the **new RPC**, not just the registration-intake candidate. Verify date and mixed-ministry behavior, replay denial, missing-letter denial, and committed grant revocation.
4. Audit and restrict old direct client writes, including member-detail status/expiration edits and letter-upload changes, so the one-year rule and selected-ministry semantics cannot be bypassed.
5. Staging preview must use a schema-compatible isolated database and synthetic users/members. Do not turn on this flag in production or run sample imports against the live registry.
6. Do not merge PR55/PR56 as production security sign-off without authorized backup/restore, rollback plan, reviewed grants and migration, and a documented operator release decision.

Run offline:
```bash
npm run typecheck
node --test tests/pr56-secure-ministry-verification.test.cjs
```

**No DB change, secret, production deployment or flag activation was made by this integration.**

## October 28 staging integration extension

- Isolated staging now has persistent `registry_verify_ministries_v1` and `registry_attach_ministry_letter_v1` RPCs, with an administrator-only private `member-documents` Storage bucket. See PR55 staged install records. This **does not** imply equivalent production migration.
- New gated Verification UI uploads an immutable PDF, PNG or JPEG (up to 5 MiB) under `verification/<member>/<membership>/<newUUID>.<ext>`; a separate authorized RPC attaches it to **one Pending Verification assignment** without changing verification or expiry. File upload failures and attach failures display an error; unlinked newly uploaded objects are cleaned up when possible.
- Only after the exact assignment has a stored letter can the administrator explicitly select and verify it. No bulk shortcuts or legacy auto-renewing upload are enabled in secure mode.
- Staging database rollback test confirmed positive attachment, wrong-path and nonadmin denial, and no status/expiry changes; staging test membership/Storage object fixtures were rolled back. **Actual Storage HTTP/JWT upload and real frontend browser tests remain unrun.**
- The `NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION` build-time flag remains unset. Do not enable it in production.
