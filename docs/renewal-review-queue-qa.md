# Renewal Review Queue — implementation and validation checklist

## Purpose
Persistent follow-up for renewal CSV staging exceptions, independent of `duplicate_flags` (new-member registration duplicate queue). Does **not** renew members, create ministry assignments, or alter registry membership statuses.

## Delivered on draft PR #24
- `/admin/import?tab=renewal`: stages CSV as before, then optionally saves **Needs Review** and **Unmatched** cases through an explicit **Save Review Cases** action.
- `/admin/renewal-reviews`: lists saved cases, filters Open/Resolved/Dismissed/All, displays candidate UIDs and parish with links to registry member details, and requires a documented decision plus notes (10 characters minimum). Each case is closed once and cannot be reopened/rewritten without a separately reviewed process.
- Links from Renewal Batches and Admin navigation; registration Pending Merges remains completely separate.
- Queue migration `supabase/proposals/renewal_review_queue.sql` was **applied to the connected Supabase database** in the preceding development phase. The SQL file is retained as a reference; do not run it again without migration review.

## Security gate / go-live requirements
1. Review SQL with diocesan registry administrator and Supabase RLS/security advisors. Confirm the exposed table is RLS-protected, with no access for `anon`.
2. In an authorized environment, securely provision `auth.users.raw_app_meta_data.registry_role` as `admin` or `renewal_reviewer` only for designated accounts (never via user-editable metadata). Refresh JWT after provisioning. The app intentionally denies access without this claim, even if an existing admin account can access older pages.
3. Apply the proposed SQL only after review. Its trigger prevents changing source evidence or modifying a closed case; no DELETE grant is issued to application users.
4. Verify RLS: non-reviewer cannot SELECT, INSERT, UPDATE; reviewer can insert only as themself, cannot change staged case details, cannot resolve without notes, and cannot change closed decisions.
5. Review retention policies and ensure private member data in candidate snapshots isn't publicly accessible. Imported CSV files are not stored by this queue; it stores only the exception details and limited candidate references.
6. Keep `main` unchanged until local build, lint, functional and security QA pass.

## Test sequence
1. With authorized test reviewer and migration installed, visit Admin → Bulk Registration Import → Renewal Import.
2. Upload a valid parish+ministry CSV containing: an exact renewable member; same-name different parish; similar name; member with missing ministry assignment; repeated CSV row; and unmatched member.
3. Stage roster. **Ready to Renew** count and selected memberships must remain as before.
4. Select **Save Review Cases**. A success message reports count and a link to Renewal Review Queue.
5. Navigate away/reload, return to Renewal Review Queue: saved cases remain, properly scoped, with candidate IDs.
6. Record a resolution for one case with notes. Verify it leaves Open and appears under Resolved, retains immutable original evidence and the reviewer/time.
7. Verify no changes in `members` or `member_ministries`; a human must use existing authorized registry tools to make corrections and then restage CSV.
8. Test errors: unauthenticated, non-reviewer JWT, migration missing, no case, short notes, repeat resolution, and repeated CSV uploads.
9. Verify existing registration Pending Merges and renewal processing/history continue working.
10. Test a large CSV under approved size limit and ensure no partial insert results; assess paging beyond the current latest-500 queue display.

## Future work
- Idempotent review-submission detection/review deduplication by canonical source and batch before production.
- Server-backed transaction endpoint and formal audit event integration if multiple reviewer roles are introduced.
- Persistent batch intake and links to later financial workflow only after the Curia authorization process is approved.
