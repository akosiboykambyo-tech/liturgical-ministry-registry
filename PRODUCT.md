# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Diocese of Kalookan staff manage liturgical ministry records and certificates. Parish leaders and members use public verification to check registration standing.

## Product Purpose

The Liturgical Ministry Registry centralizes ministry records and helps people verify current registration through a name, Registry ID, or certificate QR code. Success means staff can maintain accurate records and visitors can understand a registration result clearly.

## Operating Context

The existing application uses Next.js 13.5.1, React 18, TypeScript, Tailwind CSS, Radix UI, and Supabase. The development command is `npm run dev`. Existing routes include public lookup, verification guidance, reporting, privacy and terms, and administrative member, certificate, import, audit, and site settings workflows.

## Capabilities and Constraints

- Preserve member administration, certificate generation, and public verification workflows.
- Public lookup accepts a full name or Registry ID; certificate QR codes support verification.
- Preserve ministry-specific registration status and validity. A missing search result must not be presented as conclusive evidence that someone is not a minister.
- Interface copy currently explains that at least one active ministry registration makes a person currently registered; mixed ministry standing must remain clear.
- Repository evidence establishes implementation structure, not proof that every workflow works in production.

## Brand Commitments

Preserve the Diocese of Kalookan identity and diocesan red branding. Keep public explanations respectful, clear, and understandable.

## Evidence on Hand

Source reviewed on 15 October 2026 from `akosiboykambyo-tech/liturgical-ministry-registry`, main tree `9f488277696d03b3e09531713b040727ca30fa30`.

- `package.json`: implemented stack and scripts.
- `app/page.tsx`: lookup purpose, Registry ID example, certificate QR guidance, and interpretation of missing results. The sample member card is explicitly illustrative.
- `lib/verification-public-status.ts`: per-ministry and aggregate public status logic.
- Existing assets under `public/images/` include identity icons and a church facade SVG; their filenames alone do not establish official approval.
- README stack alternatives conflict with the implementation; use package and source evidence for technical context.

## Product Principles

- Make registration and validity understandable without specialist knowledge.
- Preserve accurate ministry-specific standing throughout public and administrative views.
- Support efficient staff workflows while keeping public verification straightforward.
- Preserve diocesan identity and accessible use across devices.

## Accessibility & Inclusion

Target WCAG 2.2 accessibility. Preserve readable contrast, keyboard access, semantic structure, responsive layouts, and reduced-motion support.

## Open Decisions

Exact staff permission boundaries, approved public data disclosure, official asset approval, and production workflow validation remain to be confirmed. Do not invent endorsements, usage statistics, or outcomes.
