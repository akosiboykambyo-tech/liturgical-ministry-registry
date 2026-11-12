const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("No legacy member-wide quick approval can issue direct writes", () => {
  const src = read("lib/verify-actions.ts");
  assert.match(src, /Member-wide approval is disabled/);
  assert.doesNotMatch(src, /\.from\(["']members["']\)/);
  assert.match(src, /registryAdminWrite<Member>\("set_status"/);
});

test("Member list and profiles use owner-guarded writes for edits/deletes", () => {
  const list = read("app/admin/members/page.tsx");
  const page = read("app/admin/members/[id]/page.tsx");
  const drawer = read("components/member-detail-drawer.tsx");
  assert.match(list, /registryAdminWrite\("delete"/);
  assert.match(list, /registryAdminWrite\("save"/);
  assert.match(page, /registryAdminWrite\("save"/);
  assert.match(drawer, /registryAdminWrite\("save"/);
  assert.match(drawer, /attachRecommendationLetter\(/);
  assert.doesNotMatch(drawer, /\.from\("member_ministries"\)\s*\.upsert/);
});

test("CSV create/import and duplicate resolution use transactional RPC", () => {
  const src = read("lib/duplicate-check.ts");
  const ui = read("app/admin/import/page.tsx");
  const add = read("app/admin/members/add/page.tsx");
  assert.match(src, /registryAdminWrite.*\("create_batch"/s);
  assert.match(src, /registryAdminWrite.*\("flag_duplicate"/s);
  assert.match(ui, /registryAdminWrite.*\("import_begin"/s);
  assert.match(ui, /registryAdminWrite.*\("import_finish"/s);
  assert.match(ui, /registryAdminWrite.*\("merge"/s);
  assert.doesNotMatch(src, /\.from\("members"\)\s*\.insert/);
  assert.match(add, /importSingleMember\(/);
});

test("Legacy group letter upload cannot change registration dates", () => {
  const src = read("app/admin/verify/page.tsx");
  const segment = src.split("const handleMassUpload =")[1].split("\n  return (")[0];
  assert.doesNotMatch(segment, /\.update\(|\.upload\(/);
  assert.match(segment, /secure Verification workspace/);
});

test("Private server write RPC proposal denies all ungranted identities", () => {
  const src = read("docs/sql/pr79-legacy-crud-rpc.REVIEW-ONLY.sql");
  assert.match(src, /registration_administrators/);
  assert.match(src, /v_actor=v_actor|a\.user_id=v_actor/);
  assert.match(src, /a\.active=true/);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.registry_admin_member_write_v1/);
  assert.match(src, /RAISE EXCEPTION 'NO-GO: PR79/);
});

test("Secure release never displays a member-wide quick approval as an active fallback", () => {
  const source = read("app/admin/verify/page.tsx");
  assert.match(source, /Verification is temporarily unavailable/);
  assert.match(source, /secureMinistryVerificationEnabled/);
  assert.doesNotMatch(source, /: <LegacyQuickScanMatrixPage/);
});

test("Legacy profile cannot attach or detach member-wide recommendation letters", () => {
  const source = read("app/admin/members/[id]/page.tsx");
  assert.doesNotMatch(source, /const handleUpload =/);
  assert.doesNotMatch(source, /const handleDeleteDocument =/);
  assert.doesNotMatch(source, /registryAdminWrite\("document"/);
  assert.doesNotMatch(source, /status,\s*notes: notes\.trim/);
});
