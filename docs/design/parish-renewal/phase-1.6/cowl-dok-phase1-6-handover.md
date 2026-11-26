# COWL-DOK | Parish Renewal Portal
## Phase 1.6 — Prototype handover & functional specification

**Document version:** 1.0 · 26 November 2026  
**Status:** Design baseline for review; not production-ready  
**Project:** Liturgical Ministry Registry, Diocese of Kalookan  
**Audience:** Project maintainers, COWL registration and finance leads, Curia reviewers, QA and implementation team

### 01 / Executive overview

The Parish Renewal Portal is intended to reduce manual encoding and roster checking across the six liturgical ministries, while preserving the diocesan registry as the authoritative record. Parish representatives submit proposed renewals, additions and corrections; COWL retains decision authority. Payment evidence and official collection records remain distinct from registry approval.

**Handover decision:** Use Phase 1.6 as the functional and interaction reference for a future development branch. It is a standalone, reconstructed HTML prototype, not a production feature or a substitute for the existing application. This handover does not authorize deployment, database changes, live payments or a change to diocesan fee policy.

| Area | Agreed direction |
| --- | --- |
| Roster | CSV-first comparison; manual alternative; explicit ministry and omission confirmation |
| Registration | COWL approval of renewals, corrections, additions and ministry assignments |
| Payment | Review first, locked quote and two references, Bank QR or COWL OTC |
| Accountability | COWL verifies collections and records pre-numbered physical receipts; Curia independently reconciles |
| Technical baseline | Existing Next.js application, Supabase backend and Vercel deployment; integration subject to current code and schema review |

### Handover artifacts

- `cowl-dok-phase1-6.html` — canonical prototype for this handover (browser-based demonstration).
- This document — scope, operating rules, source-level findings, target integration contract and release gates. The Markdown edition may be placed in project documentation after review.
- Earlier v1–v7 prototypes are historical design iterations; Phase 1.6 was reconstructed rather than patched directly from v7. The original logo and QR asset are absent in this version.

**Source basis:** Phase 1.6 HTML inspected on 26 November 2026, together with the agreed project conversation. Current repository/deployed schema and formal brand guide were not independently revalidated for this handover. No GitHub, Vercel or Supabase changes were made during this documentation task.

**Reading map:** 02 Operating workflow · 03 CSV contract · 04 Payment and stewardship · 05 Implementation contract · 06 Prototype technical notes · 07 Acceptance and testing · 08 Handover and release gates.

<!-- PAGE -->
## 02 / Operating workflow

### Actors and permissions (target)

| Actor | Responsibilities and boundaries |
| --- | --- |
| Parish representative | OTP-authenticated, parish-scoped access; stage roster, submit requests and letters, confirm quote, submit payment proof; no registry writes |
| COWL registration reviewer | Resolve identity exceptions; approve, return or reject recommendations; apply authorized audited registry changes |
| COWL finance staff | Publish fee schedule; verify collection; record physical receipt and remittance; manage documented adjustments |
| Curia reviewer | Independently reconcile confirmed collections, receipts and remittances; flag discrepancies; no routine registry editing |
| COWL assisted intake staff | Verify representative authority, locate/resume existing submission, use same workflow for walk-ins; record staff identity and origin |

### Five-step parish journey

| Step | Actions and completion conditions |
| --- | --- |
| 1. Roster | Upload CSV or review manually. Resolve exceptions, confirm omitted members and review all six ministries. Unresolved identity/hold decisions block quote locking. |
| 2. New Names | View staged CSV additions and correction requests; add recommendations manually. No official record is changed. Reconfirm affected ministry after a roster change. |
| 3. Letters | Upload PDF per ministry with recommended assignments; confirm it covers all renewing and proposed names. Changes invalidate affected letter confirmation. |
| 4. Review | Review full billing breakdown and declaration. Confirm and lock quote, create submission and payment references before any payment. |
| 5. Payment | Select enabled payment method. QR: submit bank confirmation, amount and reference. OTC: save intention and present reference to COWL. Neither confirms collection. |

### Use the demo

Open the HTML in a modern desktop browser. Start in Roster; choose Upload & match CSV, then Try sample with discrepancies. Resolve the exception rows, confirm omissions and complete the CSV declaration before applying the staged list. Review the New Names screen, attach fictional PDFs and confirm each letter. In Review, confirm the declaration to lock a demo quote. Test both payment channels with fictional evidence. The footer opens Financial Stewardship preview and Reset demo (clears local state). Never use real parish member data or make a payment from this prototype.

**Production rule:** Keep registration approval, financial collection and reconciliation as separate state machines. A submitted or paid request is not an approved minister registration. A correction after quote lock must be handled by an authorized change request, not by overwriting the original record.

<!-- PAGE -->
## 03 / CSV reconciliation contract

### Input and validation

The approved default format is exactly three columns. One row represents one recommended person in one ministry. UID, parish and renewal decision are omitted; the authenticated parish is established by the server in production. Inclusion means proposed renewal; absence is not an automatic non-renewal.

```csv
First Name,Last Name,Ministry
Maria,Santos,Ministry of Lectors and Commentators
Jose,Reyes,Extraordinary Ministers of Holy Communion
Ana,Cruz,Ministry of Liturgical Music
```

| Canonical ministry | Alias accepted by demo |
| --- | --- |
| Mother Butler Guild | MBG |
| Ministry of Greeters and Collectors | MGC |
| Extraordinary Ministers of Holy Communion | EMHC |
| Ministry of Lectors and Commentators | MLC |
| Ministry of Liturgical Music | MLM |
| Ministry of Altar Servers | MAS |

Prototype exports a blank header and a prefilled official sample roster. It accepts comma-separated CSV with exactly three recognized headers (order-independent), optional UTF-8 BOM, quoted fields and escaped quotes; 1 MB and 3,000 data rows maximum. Invalid ministry labels, blank names, malformed rows, oversized names and formula-like leading characters are rejected. Production must independently validate the file, size, scope and all values server-side.

### Matching outcomes

| Finding | Proposed action |
| --- | --- |
| Unique exact name and assignment | Suggest renewal of existing assignment; coordinator confirms roster |
| Similar name / typo | Show candidate; request correction or exclude; ambiguous identity requires COWL review |
| Unmatched | Recommend new member; COWL checks registry-wide identity before creation |
| Known name, other ministry | Request new ministry assignment against verified existing member |
| Multiple candidates | Human identity resolution; no automatic merge or UID creation |
| Repeated row / reused assignment | Exclude or resolve; never charge twice for same assignment |
| Registry assignment omitted | Explicitly choose renewing, not renewing or needs confirmation |
| Possible cross-parish match | Target server flags confidential reviewer case; do not disclose another parish's records to coordinator |

Only selected ministries are reconciled. A ministry with an intentionally empty renewal list needs explicit scope/omission confirmation; an entirely empty CSV is rejected by the demo, so use manual review. Re-upload replaces affected CSV-generated proposals, not unrelated ministries. Exact names are not definitive identity evidence; never infer a match from spelling alone. No official records change during staging.

<!-- PAGE -->
## 04 / Payment and Financial Stewardship

### Calculation and quotation

**Billable assignments = registry assignments − not renewing − unresolved + proposed additions.** Calculate separately per ministry, then sum billable count × that ministry's published rate. The prototype uses integer centavos, a sample PHP 100.00 rate per assignment and 250 fictional assignments. This is not an approved tariff. Example: 250 − 5 − 2 + 3 = 246 assignments × PHP 100.00 = PHP 24,600.00 (illustration only; outstanding unresolved identities would block final confirmation).

COWL controls versioned fees, payment opening/deadline and enabled methods. Before funds are transferred, the confirmed quote must freeze the exact payable assignment set, rate version, amounts and evidence references. A new schedule applies to eligible new quotations, never retroactively to locked ones. Date enforcement and fee authority require production policy. The demo freezes financial rows, dates and methods only, not a durable itemized roster snapshot.

| Reference | Purpose |
| --- | --- |
| Submission reference | Shared identifier linking registration, evidence, review and finance |
| Payment reference | Links the locked quote to one or more authorized collection records |
| Physical receipt serial | Actual pre-printed receipt number recorded by COWL after collection; not generated by the portal |

### Payment paths and controls

| Bank QR / InstaPay | COWL OTC |
| --- | --- |
| Present authorized bank instructions and locked amount. Upload confirmation (PNG, JPEG or PDF, up to 10 MB); enter bank reference and transfer amount. | Present payment reference and locked amount to COWL. Save payment intention; no bank confirmation upload required. |
| Exact amount: under verification. Mismatch: discrepancy review. Neither means funds received. | Status remains payment pending until authorized collection is recorded. |
| COWL independently checks amount, receiving account, settled transaction and duplicate reference against bank evidence. | COWL cashier verifies collection, records actual receipt number and payment details. |

OCR is a proposed preliminary extraction service, not currently implemented. Compare transfer amount (not fees or gross debit), currency, transaction reference and date. Low-confidence/unreadable or discrepant evidence routes to manual review. Matching OCR never establishes payment settlement. Store proof privately and minimize unnecessary financial data.

COWL issues physical receipts, records collections and remittances; Curia independently reconciles. Use immutable posted collection entries and traceable adjustments, refunds or credits for rejected additions, under/overpayments and corrections. Do not rewrite prior receipt or quote records. Fee basis (person vs assignment), refund authority, receipt numbering scope, bank authorization and remittance policy remain open decisions.

<!-- PAGE -->
## 05 / Target implementation contract

### Integration architecture (proposed)

Use the existing Next.js application and authorized Supabase operations. Create a dedicated feature branch and isolate development/staging data. Do not transplant the standalone script directly into production. Reuse existing brand components, registration intake and read-only matching concepts; validate the latest repository state and deployed schema first.

| Component | Required responsibility |
| --- | --- |
| Parish portal | OTP authentication; authorized representative/parish binding; drafts, reconciliation, letters, confirmation, payment status |
| Registration / Submissions | Online and staff-assisted renewal intake, lookup/resume; existing CSV processing remains available |
| Registration / Review Queue | Corrections, possible duplicates, transfers, new members and missing assignments; documented reviewer decisions |
| Registration / History | Approved/returned/rejected outcomes, submission revisions and immutable audit links |
| Financial Stewardship | Payment Schedule, Collections, Receipt Register, Remittances and Reconciliation; role-restricted operations |
| Curia reconciliation | Independent confirmation and discrepancy handling, least-privilege financial view |

### Logical records (not an approved physical schema)

| Entity | Minimum information / invariants |
| --- | --- |
| Submission + revision | Server ID, parish, renewal cycle, origin, actor, state, revision, timestamps; uniqueness/duplicate policy by parish, ministry and cycle |
| Proposed assignment / review case | Source row, canonical ministry, candidate IDs, original/proposed names, recommendation, resolution, reviewer and evidence |
| Document | Private storage key, type, size, checksum, ministry, revision, upload actor and coverage confirmation |
| Schedule + quote | Approved schedule version, effective dates, itemized assignment IDs, unit rates and centavo totals; immutable upon confirmation |
| Payment / receipt / adjustment | Quote reference, channel, evidence, bank reference, verified amount, collector, physical receipt serial; append-only posted events |
| Remittance / reconciliation | Collection allocations, remittance reference, independent reviewer, discrepancy and resolution history |

### Security and lifecycle requirements

Derive parish and permissions from trusted server authentication, never CSV columns or client claims. Use restricted queries/RLS and private storage with controlled access; do not expose the registry-wide administrative matcher. Recheck identity and eligibility transactionally, fail closed on incomplete lookup, enforce unique assignment and idempotent request constraints, prevent stale writes and quote races. Audit actor, source, before/after data, decision, timestamp and reason; preserve existing UIDs and history. Define evidence retention, deletion/redaction, backups and recovery with diocesan privacy and finance leads before go-live.

<!-- PAGE -->
## 06 / Prototype implementation and limitations

### Source map

The single HTML file contains markup, CSS and vanilla JavaScript. It references Google Fonts (Inter and EB Garamond, with local fallbacks). There are no application-framework dependencies or live backend endpoints. The fictional dataset is generated in memory; `localStorage` key `cowl-demo-v8` saves draft decisions, rates, quote totals and payment metadata on the same browser/origin when available.

| Source identifiers | Responsibility |
| --- | --- |
| `registry`, `ministries`, `fresh`, `state` | 250 fictional assignments, six canonical ministries and default demo state |
| `csvText`, `parseCSV`, `matchRows`, `startStage` | Export, CSV validation and staged matching |
| `omitted`, `apply`, `changed`, `complete` | Scope, omissions, apply draft, invalidate review/letters and gate confirmation |
| `totals`, `sum`, `review`, `payment` | Centavo calculations, quote confirmation and payment UI |
| `finances`, `save`, `render` | Sample fee publication, browser persistence and DOM rendering |

### Known limitations and release blockers

| Priority | Source-level finding / required remedy |
| --- | --- |
| Critical | No OTP, parish authorization, staff access control, server persistence or official approval. Demo controls are not security boundaries. |
| Critical | File metadata only: PDFs and payment proof retain filenames, not bytes. Staged CSV comparison is memory-only until applied. Build private durable storage and resumable server drafts. |
| Critical | Demo reference generation and quote lock are client-side; quote records aggregate financial rows, not immutable assignment/evidence snapshots. Create atomic server-side confirmation with collision-safe references. |
| High | Matching is simplified: case/space normalization and one-edit tolerance for names of at least four characters; no cross-parish dataset. A single candidate can still be wrong. No staff-resolution interface exists for blocked identity cases. |
| High | Deduplication is limited to current demo rules; manually added names and later CSV choices can still require cross-request identity and assignment reconciliation. Enforce authoritative uniqueness and revalidate before lock. |
| High | Schedule dates are configurable but not enforced; no real QR, OCR, bank settlement, receipt register, refund or Curia reconciliation. |
| Medium | Text-only brand header; no Phosphor icon integration in reconstructed HTML. Restore official logo and Phosphor Light in production; formal brand compliance and WCAG 2.2 AA require verification. |

The prototype is disposable design evidence, not a secure implementation. Prior browser smoke-test claims were reported in the development conversation; this handover separately checks source logic and does not certify real browser persistence, accessibility or full integration.

<!-- PAGE -->
## 07 / QA and acceptance criteria

### Source checks performed for this handover

On 26 November 2026, Node.js checks executed the actual prototype's pure functions. Results: 250 sample registry rows; prefilled CSV round-trip returned 250 exact matches; discrepancy sample returned 251 incoming rows (248 exact, one similar, one unmatched, one duplicate); unsupported UID column rejected; baseline PHP 25,000.00; exclusions, holds and additions recalculated correctly; a captured financial-row snapshot retained its amount after a rate change. These checks do not exercise browser UI, network security or database writes.

### Required acceptance matrix (before production)

| ID | Scenario | Expected result |
| --- | --- | --- |
| R01 | Valid full and partial CSV; abbreviations and quoted names | Correct scope and parse; untouched ministries preserved |
| R02 | Missing/extra column, bad ministry, malformed/oversized file | Reject with actionable errors; no partial apply |
| R03 | Typo, same name, transfer, missing assignment, unmatched name | Appropriate review request; no automatic identity creation or merge |
| R04 | Duplicate rows, reused assignment, CSV/manual overlap | No duplicate recommendation or charge; unresolved conflicts block confirmation |
| R05 | Missing roster name, empty ministry, manual review | Explicit omission decisions; no automatic non-renewal; complete all required reviews |
| L01 | Missing/changed letter or recommendation | Block lock until required signed PDF and coverage confirmed for current revision |
| F01 | Mixed rates, exclusions, additions, schedule changes | Exact centavo calculations; locked itemized quote unchanged after publication |
| F02 | Concurrent confirmation and retries | One durable submission/payment reference pair; no duplicate quote |
| F03 | QR match/mismatch/unreadable/duplicate proof; OTC | Correct pending/review status; no automatic collection confirmation |
| F04 | Verified collection, refund/credit, receipt and remittance | Authorized immutable entries; traceable adjustment; Curia reconciliation |
| S01 | Cross-parish/role access, spoofed client data, expired OTP | Deny unauthorized reads/writes; no sensitive disclosure |
| S02 | Reload, interrupted upload, retry, restore backup | Durable draft/evidence and idempotent recovery; no partial writes |
| U01 | Keyboard, screen reader, zoom, mobile, slow network | Accessible task completion, clear status, no lost data or horizontal page overflow |

**Acceptance evidence:** For each test retain environment, build/commit, fixture, expected and actual outcomes, tester, date and evidence reference. Test on synthetic data in isolated staging; no live parish member records or real money. Production release requires all critical gates to pass and documented owner approval. The table is a proposed test plan, not a record of successful execution.

<!-- PAGE -->
## 08 / Handover and release plan

### Decisions & open questions

| Decision / owner to confirm | Status |
| --- | --- |
| CSV-first, three required fields; no UID or renewal-decision column | Approved design direction |
| Five-step sequence, review before payment, no parish registry editing | Agreed workflow |
| COWL physical receipt; Curia independent reconciliation | Agreed operating direction; confirm formal procedures |
| Charge per person or per ministry assignment; rates, waivers, eligibility | Open — COWL/Curia finance authority |
| Handling ambiguous identity before lock; correction turnaround and partial approval | Open — registration lead |
| OTP provider, representative enrollment/revocation, staff role matrix | Open — project/security owner |
| Quote expiry, adjustment/refund/credit, remittance and bank policy | Open — COWL/Curia finance authority |
| Data retention, privacy, document access and audit policy | Open — diocesan privacy and registry owners |
| Formal brand/assets, accessibility and final Phase 1 acceptance | Pending — design/QA and project owner |

### Recommended delivery sequence

1. Freeze this prototype as review evidence; obtain sign-off on remaining product and finance decisions. Validate against real-world CSV formats using anonymized/synthetic fixtures.
2. Create a dedicated development branch after authorization. Audit current code, migrations, permissions and matching behavior. Specify server contracts and build scoped registration intake and queue integration.
3. Implement Financial Stewardship, versioned itemized quotations, verified collections, receipts and Curia reconciliation. Agree collection authority before enabling payments.
4. Implement and test authentication, authorization, private evidence storage, audit, transactional operations and idempotency alongside the earlier phases. Security is a release prerequisite, not a final cosmetic task.
5. Run isolated staging acceptance and accessibility checks, prepare migration/rollback plan, staff training and operational support. Obtain explicit approval before merging/deploying or enabling real payment.

### Artifact identity and sign-off

Prototype file: `cowl-dok-phase1-6.html`  
SHA-256: `87e219812d2991b3318b2a839f575d7c2126c88ba14789bf233c0e352379e9de`

| Review role | Decision / date |
| --- | --- |
| Project owner / product lead | Pending formal sign-off |
| COWL registration lead | Pending |
| COWL finance and Curia representatives | Pending |
| Technical / security / QA lead | Pending |

**Handover status:** Functional prototype documentation complete for review. Production implementation, formal operational authorization and acceptance remain pending. No repository commit or deployment is included in this handover.
