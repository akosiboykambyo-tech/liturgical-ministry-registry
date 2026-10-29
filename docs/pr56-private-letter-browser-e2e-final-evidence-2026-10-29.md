# PR56 — Private signed-letter browser E2E: successful final evidence
**Date:** 2026-10-29
**Scope:** `Ministry-Registry-Test` (isolated Supabase project `rtptybxugjhvpfjvcvgw`) only.

## Operator's real-browser test result

The operator executed `scripts/pr56-staging-letter-review-browser.cjs --validate-config` and `--run` on Windows with a real staging administrator Auth session. The output reported PASS for:
1. Isolated staging configuration validation (no requests).
2. Real administrator authentication.
3. Creation of exactly one synthetic minister and two pending ministry assignments.
4. Attachment of one private synthetic PDF to the Ministry of Lectors and Commentators, without verification.
5. A **five-minute private signed Storage URL** serving the correct PDF in Chromium.
6. The matching ministry becoming selectable after opening the letter, while the other ministry stayed ineligible; **no Verify click**.
7. Mobile-width private-letter review controls.
8. No verification or renewal updates.
9. Removal of the synthetic member and two assignments by an active-admin-checked cleanup RPC.
10. Removal of the private PDF through the Storage API.
11. Completion of the isolated browser run.

## Independent staging state after the operator run

Read-only SQL independently confirmed:
- `public.members`: **1,008**
- `public.member_ministries`: **12** (12 Pending Verification)
- PR56REVIEW synthetic members: **0**
- `storage.objects`: **0**
- The real `registry_verify_ministries_v1` and `registry_attach_ministry_letter_v1` functions remained installed.

## Temporary RPC teardown

Applied **isolated-staging-only** migration `pr56_staging_private_letter_review_fixture_teardown_20261029` from
`docs/sql/pr56-staging-letter-review-teardown.ISOLATED-ONLY.sql`.

It guarded the baseline and dropped **only** `pr56_review_begin_v1(uuid)` and `pr56_review_finish_v1(uuid,uuid)`, without CASCADE. Follow-up read-only SQL confirmed **both temporary helpers absent**, **both real secure registry RPCs present**, and **1,008 members / 12 assignments / 0 synthetic members / 0 stored files**.

## Gate decision

**PASS/CLOSED:** Private recommendation-letter browser access, matching ministry selection, mobile interaction, and test cleanup.

Not established: a human's actual document review; production admin sign-in functionality against isolated staging; server-side renewal rules for the production renewal schema; production schema/RLS/legacy-write compatibility, full backup/restore or approval to activate the frontend feature flag. Do not promote this into a production release GO decision.

Both PRs must remain draft and unmerged until independently approved.
