# PR55 — secure per-ministry recommendation letters (isolated staging)

The staging Storage project initially had **zero buckets and zero objects**. The existing PR56 legacy uploader automatically marked a ministry Renewed, so it was disabled in secure mode. This staging-only install supplies a distinct pending-letter operation; it does **not** verify, renew, set expiry, or change any member-wide status.

The installer is guarded against production-shaped schema, requires the already-installed security RPC, exactly two staging Auth identities, one active grant, and absence of a preexisting member-documents bucket.

It creates a **private** `member-documents` bucket limited to 5 MiB PDFs/PNGs/JPEGs, plus SELECT/INSERT/DELETE `storage.objects` policies for an authorized administrator under the `verification/` path exclusively. Files are immutable by default; no UPDATE or upsert access is granted. The attached private path must encode both a real member and a pending assignment UUID, match a previously uploaded object, and satisfy the RPC's active-grant authorization. The RPC updates `document_url` and upload timestamp only.

**Not production-ready without separate approval.** The production bucket already exists, and policy conflicts, storage quotas, audit rules, retention, private signed-URL access and history must be reviewed there. Do not copy this staging-only migration into production.

For staging rollback: revoke execution and drop the new attach RPC; drop three named Storage RLS policies; delete the test-only bucket **only after** confirming there are no legitimate documents or objects, otherwise retain files for operator review. Never delete production files. Verify user roles, no bypasses, staged single-assignment attachment, missing object denial, unrelated member denial, and unchanged statuses. Any staging synthetic upload is test-only and must be removed through an approved cleanup.
