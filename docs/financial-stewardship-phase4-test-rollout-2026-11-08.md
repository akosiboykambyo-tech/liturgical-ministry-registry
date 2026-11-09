# Phase 4 isolated test deployment — 8 November 2026

Status: Successfully deployed to Supabase Ministry-Registry-Test only. Production, the live COWL-DOK site and the existing browser-local financial preview were not changed or connected to real financial data.

## Confirmed database results

- 28 fs_ public tables (original 27 + independent fs_curia_fund_receipts).
- 28 scoped SELECT RLS policies, all 28 tables RLS enabled, no direct financial client write grants.
- 52 canonical parish/mission-station entries and the six official ministries from lib/constants.ts.
- One private fs-private Storage bucket with no browser upload/download permissions.
- 14 explicitly granted public SECURITY INVOKER financial/coordinator RPC endpoints, backed by restricted fixed-search-path private role-checking functions.
- Nine immutable-evidence audit/history triggers.
- No authorized bank/QR account provisioned. No user assigned a staff role or coordinator contact permanently.
- Verified zero persisted collections, receipt stock, remittances, Curia reviews and audit records after rollback tests.

## Supabase test migration history

1. phase4_fs_secure_foundation_test_only — original 27 RLS-protected tables.
2. phase4_fs_scoped_read_policies_test_only — scoped read policies and role lookup.
3. phase4_fs_canonical_lookups_test_only — canonical parish/ministry seeds.
4. phase4_fs_curia_fund_receipts_test_only — 28th table, independent Curia-side funds evidence.
5. phase4_fs_trusted_cowl_collection_commands_test_only — QR bank-credit verification and OTC collection.
6. phase4_fs_curia_remittance_commands_test_only — COWL remittance and Curia independent confirmation.
7. phase4_fs_receipt_custody_and_immutability_test_only — Curia booklet inventory, COWL custody and evidence immutability.
8. phase4_fs_private_storage_bucket_test_only — private file holding bucket.
9. phase4_fs_coordinator_scoped_registry_commands_test_only — safe parish roster, draft, inactivation request.
10. phase4_fs_exact_paper_line_items_test_only — requires exact printed paper breakdown, no placeholder receipt lines.

The source SQL scripts are in supabase/proposals, with reproducible rollback test in supabase/tests/financial_stewardship_phase4_end_to_end_rollback.sql. A reviewed Supabase CLI migration set and release plan is still required for any production deployment.

## Integration with the existing Financial Stewardship design

- Curia retains ownership of preprinted official receipt stock. It registers serials, hands over a booklet and waits for COWL physical custody acknowledgment.
- COWL accepts QR Ph only after a finance verifier matches the real receiving-account statement credit, full transaction reference, account, provider and amount. OTC cash is counted and posted separately through an authorized staff operation.
- A COWL receipt issuer enters the exact available printed serial, payer/ministry wording and actual line items. The line total must match the verified collection and the number cannot be reused.
- COWL prepares an itemized remittance with issued receipts and duplicate copies, then sends funds to Curia.
- Curia independently records evidence of the second COWL-to-Curia funds movement, examines each physical duplicate, then confirms or reports discrepancies with a distinct Curia identity.
- Coordinator access is parish-scoped and limited to two active approved contacts; the new roster RPC reads existing members and member_ministries without modifying them. Inactivation requests do not change authoritative membership.
- A Paid collection, a paper receipt issue, a Curia remittance confirmation and a completed member renewal are four different facts.

These are real test-database functions and tables, but **the existing web pages still operate on fictional browser-local demo data**. They are not automatically connected to the test database, and no real QR Ph, bank account, bank-statement integration or physical receipt has been configured.

## Security and functional tests completed

Executed within BEGIN/ROLLBACK against isolated test identities; no synthetic financial rows remain:

1. Unapproved authenticated user cannot post QR/OTC transactions.
2. Genuine matching mock bank credit posts one QR collection; repeat is rejected.
3. Incorrect paper line count x rate or mismatched amount is rejected without consuming an official receipt serial.
4. A valid printed receipt issues once; a second issuance using the same collection/serial is rejected.
5. Already remitted collection cannot be submitted twice.
6. Curia cannot confirm without checking physical duplicates, even when matching funds have been independently recorded.
7. Matching funds and copies permit independent Curia acknowledgment.
8. Curia booklet overlap is rejected; leading zeros preserved; invalid custody acknowledgement and reuse of voided receipt are rejected.
9. Parish A coordinator cannot inspect Parish B roster, third coordinator slot is rejected and a second original batch is rejected.
10. Anonymous read/post privileges and browser collection/Curia writes are denied; anonymous cannot access the private helper schema.

Security advisor: no missing RLS policies on the new finance tables. Earlier existing registry RPC security-definer warnings and Auth leaked-password protection advisory remain and should be reviewed separately:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Not yet complete or authorized

- Approval of the organizational bank/QR Ph account designated for COWL collections, authorized fee schedules, actual officer identities, Curia physical receipt rules and financial governance.
- Scoped private Storage uploads, file scanning/signature checks, retention and bank-statement ingestion; the private bucket remains deny-by-default.
- Full payment request/quote issuance and parish evidence submission APIs, fee/partial payment exceptions, controlled reversals/refunds and independent concurrency/security audit.
- Authenticated Next.js COWL/Curia adapter pointed explicitly to the isolated test Supabase project, followed by real cross-device/browser QA. Do not silently rewire the live site or its authentication credentials.
- Final review of source migration history and tested production rollout/rollback plan.

Production Supabase has ZERO fs_ tables as of the post-test verification. The test schema is ready for further restricted integration development; **financial go-live is not authorized or complete**.
