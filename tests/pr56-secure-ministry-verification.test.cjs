const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname,"..",file),"utf8");

const page = read("app/admin/verify/page.tsx");
const secure = read("components/secure-ministry-verification.tsx");
const actions = read("lib/secure-ministry-verification.ts");

test("secure verification requires an explicit deployment flag", () => {
  assert.match(actions,/NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION === "enabled"/);
  assert.match(page,/secureMinistryVerificationEnabled\s*\?\s*<SecureMinistryVerification \/>/);
  assert.match(page,/<LegacyQuickScanMatrixPage \/>/);
});
test("secure flow lists pending canonical assignments rather than member-wide status", () => {
  assert.match(secure,/\.from\("member_ministries"\)/);
  assert.match(secure,/\.eq\("status", "Pending Verification"\)/);
  assert.match(secure,/members!inner/);
  assert.match(secure,/new Map<string, PendingMember>/);
});
test("secure assignment chooser starts with nothing selected", () => {
  assert.match(secure,/setSelected\(new Set\(\)\)/);
  assert.match(secure,/selected\.size === 0/);
  assert.match(secure,/ids\.length !== selected\.size/);
});
test("secure page requires ministry-specific document and exposes record review", () => {
  assert.match(secure,/!assignment\.document_url \|\| !reviewedIds\.has\(assignment\.id\)/);
  assert.match(secure,/No ministry recommendation letter on file/);
  assert.match(secure,/href=\{\`\/admin\/members\/\$\{active\.member\.id\}\`\}/);
});
test("RPC is specific to member and selected ministry IDs with a database-computed date", () => {
  assert.match(actions,/\.rpc\("registry_verify_ministries_v1", \{/);
  assert.match(actions,/p_member_id: memberId/);
  assert.match(actions,/p_membership_ids: membershipIds/);
  assert.match(actions,/p_status: "New"/);
  assert.doesNotMatch(actions,/expiration_date\s*:/);
  assert.doesNotMatch(actions,/\.from\("members"\)/);
});
test("RPC failures fail closed without legacy fallback", () => {
  assert.match(actions,/if \(!secureMinistryVerificationEnabled\)/);
  assert.match(actions,/PGRST202/);
  assert.match(actions,/No assignment was changed/);
  assert.match(actions,/new Set\(membershipIds\)\.size !== membershipIds\.length/);
  assert.match(actions,/updated_assignments !== membershipIds\.length/);
  assert.doesNotMatch(secure,/quickVerifyMember/);
});
test("secure screen offers no old bulk approvals or client-side status updates", () => {
  assert.doesNotMatch(secure,/handleMassVerify|handleMassUpload|setOptimisticIds/);
  assert.doesNotMatch(secure,/\.update\(\{\s*status/);
  assert.match(secure,/Renewals with recommendation letters are handled in the Renewals tab/);
});

test("legacy editing entry points fail closed when secure mode is enabled", () => {
  const verifyActions = read("lib/verify-actions.ts");
  const memberPage = read("app/admin/members/[id]/page.tsx");
  const drawer = read("components/member-detail-drawer.tsx");
  assert.match(verifyActions, /if \(secureMinistryVerificationEnabled\)/);
  assert.match(memberPage, /Legacy member editing is locked/);
  assert.match(drawer, /Direct member and assignment edits are paused/);
  assert.match(drawer, /Legacy upload also renews the ministry without secure approval/);
  assert.match(drawer, /Direct document changes are disabled/);
});

test("secure letter attachment uses private immutable Storage then dedicated no-renewal RPC", () => {
  assert.match(actions,/\.storage\.from\("member-documents"\)/);
  assert.match(actions,/storage\.upload\(path, file/);
  assert.match(actions,/upsert: false/);
  assert.match(actions,/registry_attach_ministry_letter_v1/);
  assert.match(actions,/p_document_path: path/);
  assert.doesNotMatch(actions,/storage\.remove\(\[path\]\)/);
  assert.match(actions,/The uploaded private file was retained/);
  assert.match(secure,/No verification or renewal was applied/);
});

test("minister-specific private recommendation letter can be inspected before approval", () => {
  assert.match(actions,/getPendingMinistryLetterReviewUrl/);
  assert.match(actions,/\.createSignedUrl\(documentPath, 300\)/);
  assert.match(actions,/Invalid private recommendation-letter path/);
  assert.match(secure,/Open recommendation letter \(new tab\)/);
  assert.match(secure,/target="_blank" rel="noopener noreferrer"/);
  assert.match(secure,/!reviewedIds\.has\(assignment\.id\)/);
  assert.match(secure,/!reviewedIds\.has\(id\)/);
  assert.match(secure,/setReviewedIds\(new Set\(\)\)/);
  assert.match(secure,/Refresh secure link/);
});
