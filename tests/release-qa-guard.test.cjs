const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
test("QA route is dynamically server-gated to the exact TEST Supabase preview", () => {
  const page = read("app/release-qa/page.tsx");
  assert.match(page, /VERCEL_ENV\s*!==\s*"preview"/);
  assert.match(page, /NEXT_PUBLIC_SUPABASE_URL\s*!==/);
  assert.match(page, /https:\/\/rtptybxugjhvpfjvcvgw\.supabase\.co/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /dynamic\s*=\s*"force-dynamic"/);
});
test("QA uses real client JWT but never displays credentials or writes content", () => {
  const source = read("app/release-qa/release-qa-client.tsx");
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /Authorization:\s*"Bearer "\s*\+\s*accessToken/);
  assert.match(source, /financial-stewardship\/access\?workspace=cowl/);
  assert.match(source, /financial-stewardship\/access\?workspace=curia/);
  assert.match(source, /__release_qa_invalid_noop__/);
  assert.match(source, /registry_verify_ministries_v3/);
  assert.match(source, /storage\.from\(bucket\)\.list/);
  assert.doesNotMatch(source, /console\.log|localStorage|service_role|createSignedUrl|\.upload\(|\.download\(|\.updateUser\(|\.insert\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(source, /setResults\(.*access_token|report\s*=.*access_token/);
});

test("TEST-only synthetic Storage transfer QA verifies actual bytes and no production or real member files", () => {
  const route = read("app/release-qa/page.tsx");
  const parent = read("app/release-qa/release-qa-client.tsx");
  const code = read("app/release-qa/storage-transfer-qa.tsx");
  assert.match(route, /VERCEL_ENV\s*!==\s*"preview"/);
  assert.match(route, /rtptybxugjhvpfjvcvgw\.supabase\.co/);
  assert.match(parent, /<StorageTransferQa\s*\/>/);
  assert.match(code, /const BUCKET = "member-documents"/);
  assert.match(code, /release-qa\/synthetic-private-access-v1\.png/);
  assert.match(code, /type: "image\/png"/);
  assert.match(code, /upsert: false/);
  assert.match(code, /auth\.getUser\(session\.access_token\)/);
  assert.match(code, /\.download\(FIXTURE\)/);
  assert.match(code, /createSignedUrl\(FIXTURE, 15\)/);
  assert.match(code, /\.upload\(DENIED_PATHS\[/);
  assert.match(code, /\.remove\(\[FIXTURE, \.\.\.DENIED_PATHS\]\)/);
  assert.match(code, /Authorization: "Bearer " \+ anonKey/);
  assert.doesNotMatch(code, /service_role|SUPABASE_SERVICE_ROLE_KEY|\.from\("members"\)|\.from\("member_ministries"\)|console\.log|localStorage/);
});

test("TEST certificate persistence QA creates only an isolated non-default record", () => {
 const route = read("app/release-qa/page.tsx");
 const parent = read("app/release-qa/release-qa-client.tsx");
 const qa = read("app/release-qa/certificate-persistence-qa.tsx");
 assert.match(route, /VERCEL_ENV\s*!==\s*"preview"/);
 assert.match(route, /rtptybxugjhvpfjvcvgw\.supabase\.co/);
 assert.match(parent, /<CertificatePersistenceQa\s*\/>/);
 assert.match(qa, /certificate_template_releaseqa_/);
 // Regression: public.system_settings.key is varchar(50), prefix length 31.
 // Full 32-character UUID produced 63 characters and SQLSTATE 22001.
 const keyPrefix = "certificate_template_releaseqa_";
 assert.equal(keyPrefix.length, 31);
 assert.ok(keyPrefix.length + 16 <= 50);
 assert.ok(keyPrefix.length + 32 > 50);
 assert.match(qa, /user\.id\.replace\(\/\-\/g, ""\)\.slice\(0, 16\)/);
 assert.match(qa, /insert\.error\?\.code/);
 assert.match(qa, /auth\.getUser\(session\.access_token\)/);
 assert.match(qa, /is_default: false/);
 assert.match(qa, /\.insert\(\{/);
 assert.match(qa, /\.update\(\{ value:/);
 assert.match(qa, /\.delete\(\)\.eq\("key", key\)/);
 assert.match(qa, /originalDefault\[0\] === "certificate_template_2027-renewal"/);
 assert.doesNotMatch(qa, /\.from\("members"\)|\.from\("member_ministries"\)|\.from\("signatories"\)|\.upsert\(|service_role|SUPABASE_SERVICE_ROLE_KEY|console\.log/);
});

test("negative-account QA is confined to TEST preview and does not alter any staff grants", () => {
 const route = read("app/release-qa/page.tsx");
 const parent = read("app/release-qa/release-qa-client.tsx");
 const source = read("app/release-qa/negative-access-qa.tsx");
 assert.match(route, /VERCEL_ENV\s*!==\s*"preview"/);
 assert.match(route, /rtptybxugjhvpfjvcvgw\.supabase\.co/);
 assert.match(parent, /<NegativeAccessQa\s*\/>/);
 assert.match(source, /EXISTING_TEST_STAFF/);
 assert.match(source, /auth\.getUser\(token\)/);
 assert.match(source, /"unassigned"\s*\|\s*"granted"\s*\|\s*"revoked"/);
 assert.match(source, /fs_staff_grants/);
 assert.match(source, /revoked_at/);
 assert.match(source, /financial-stewardship\/access\?workspace=all/);
 assert.match(source, /financial-stewardship\/access\?workspace=cowl/);
 assert.match(source, /financial-stewardship\/access\?workspace=curia/);
 assert.match(source, /registry_admin_member_write_v1/);
 assert.match(source, /registry_verify_ministries_v3/);
 assert.match(source, /storage\.from\("member-documents"\)\.list/);
 assert.match(source, /certificate_template_releaseqa_/);
 assert.match(source, /"42501"/);
 assert.doesNotMatch(source, /\.from\("fs_staff_grants"\)\.(?:insert|update|upsert|delete)\(/);
 assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY|signUp\(|inviteUserByEmail\(|createUser\(|console\.log|localStorage/);
});
