# Phase 2 — one-batch staff authorization intake

The project can enable role-based Financial Stewardship when the Commission/Diocese has formally authorized the staff identities below. No production roles are granted merely by submitting this document; an authorized operator must approve and provision each person.

## What the appointing authority supplies ONCE

For each named person:

| Staff member | Work email (unique Auth account) | Authorized role(s) | Appointing authority / approver | Written appointment reference or approval date | Expiration (or no expiry) | Existing portal login? |
| --- | --- | --- | --- | --- | --- | --- |
| [Person A] | [address] | `cowl_finance_verifier` | [officer] | [reference] | [date / none] | [yes / no] |
| [Person B] | [address] | `cowl_receipt_issuer` | [officer] | [reference] | [date / none] | [yes / no] |
| [Person C] | [address] | `cowl_remittance_preparer` | [officer] | [reference] | [date / none] | [yes / no] |
| [Person D] | [address] | `curia_receipt_custodian` | [officer] | [reference] | [date / none] | [yes / no] |
| [Person E] | [address] | `curia_treasury_reviewer` | [officer] | [reference] | [date / none] | [yes / no] |

The five roles are not necessarily five people. One staff member may hold more than one authorized role, but **the Curia treasury confirmer must be a different responsible person from the COWL remittance preparer**, especially when financial operations are eventually activated.

### Additional optional roles

- `cowl_registry_reviewer` — registry review only; no financial dashboard access by itself.
- `platform_provisioner` — technical provisioning only; no financial transaction or page authority by itself.

### Important handling and account creation

- **Do not transmit passwords, OTPs, reset links, service-role keys or bank credentials.** Each person should create or accept an account through the authorized Supabase Auth flow. Finance-only accounts must not be silently added to the registry administrator allowlist.
- The appointment reference and accountable approver are required by the role table constraints. Granting access must be a trusted audited administrative action, not a browser form exposed to staff.
- Names and work emails should be shared only in the authorized project conversation/channel; do not add them to publicly accessible code or demo screenshots.
- The current migration `20261110010332_finance_role_grants_readonly_foundation` created **zero** grants. Production remains Phase 1 read-only until verified role assignments and full role-session QA pass.

## Single release batch after receipt of approval

1. Reconcile the approved staff list with production Supabase Auth identities; invite new staff via the official account flow without distributing passwords.
2. Provision only the explicitly approved grants, with the authorization reference and grantor identity, expiry where specified; verify separation of duties.
3. Exercise actual signed-in COWL-only, Curia-only, registry-only, dual-role, and unassigned sessions; check expired and revoked grants, unauthorized direct URLs and recovery flows.
4. Recheck the exact Vercel build, preview and no-write financial boundary; promote the verified release to production with the prior deployment available for rollback.
5. Confirm accessible pages with each authorized user and no change to member records or financial transactions.

**Do not deploy the role-gated UI before steps 1–3 pass.** The presence of an empty role table does not mean anyone has been appointed.
