# PR56: Clarify existing legacy letter versus per-ministry evidence

The October 29 production member-list screenshot showed Renewed (Validated) on both assignments and an orange “Recommendation Letter Needed” warning. **Live read-only production checks confirmed** both assignments have no `member_ministries.document_url`, but a nonempty older `members.document_url` points to a file that exists in the private `member-documents` bucket. Its contents and intended ministry coverage have **not** been reviewed. The September 19 renewal expiration was corrected to September 19, 2027 and matches the calendar-year rule.

The member-list warning used `memberships.some(m => !m.document_url)` and thus was correctly identifying missing **per-ministry links**, but the text falsely suggested that no letter file existed anywhere. This change, available **only in draft PR56 until deployment**, distinguishes:

- “Ministry letter not linked: MLC, MLM (older member-level letter exists; review coverage before linking)” when a legacy member-level file exists;
- “Ministry recommendation letter missing: MLC, MLM” when no member-level file is recorded.

The warning remains visible until the relevant ministry-level evidence is actually linked; it does **not** accept the legacy file as proof, copy data, verify/renew, or change any production record. The “Letter Expiring Soon” label was also corrected to “Registration Expiring Soon” because its predicate examines `expiration_date`.

**Important secondary finding:** the Ministry of Liturgical Music currently has `renewal_date=2026-11-07` and `expiration_date=2027-11-07` in production, although October 29, 2026 is the present date. This is a future-dated Renewed assignment requiring separate authorized review before any letter-attachment or renewal action. Neither record was edited by this PR.

Do not use the legacy member drawer's “Upload recommendation letter” function as a remediation: the current production handler immediately sets `status='Renewed'`, overwrites renewal and expiry dates and can therefore unintentionally change the certified renewal period. In the staged secure workflow, ministry-specific letters are only attached via a private, authorized RPC with no automatic verification or renewal. Legacy member-level files must first be reviewed for coverage and reattached via a separately approved audited procedure. No production mutation or feature-flag activation is authorized.
