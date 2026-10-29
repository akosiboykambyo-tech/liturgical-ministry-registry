# PR56 legacy direct-write UI closure, preproduction guard

**Scope:** This guard is activated only when `NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION=enabled`; production currently remains disabled. Five additional legacy handlers now fail closed before calling Supabase writes:

- member list: member edit and member deletion
- member detail page: member-wide recommendation-letter upload and deletion
- legacy verification matrix: mass-upload handler (defense in depth, even though the component is already hidden by the secure-mode switch)

Existing PR56 guards remain in `lib/verify-actions.ts`, the member-detail drawer, and member-detail editing. These changes are a **temporary freeze of old functionality**, not replacement implementations. Direct edit/delete actions will be unavailable in the secure launch until separately authorized, audited administrator RPCs and workflows are built.

**Critical:** Browser-side guards are not a security boundary. Production currently grants direct write operations to the `authenticated` role and still uses a fixed admin UUID policy. A production database migration must remove direct write grants and obsolete policies, replace them with tightly scoped administrator RPCs, and prove compatibility with the approved UI. Because some admin tasks would become unavailable, do not switch the feature flag or revoke production table privileges automatically.

Browser/mobile smoke and staging private-letter review passed previously; these new guards have offline source tests only. Manual negative UI testing and full rollout gating remain necessary.