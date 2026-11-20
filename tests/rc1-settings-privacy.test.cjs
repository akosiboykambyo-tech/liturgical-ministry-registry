const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const route = read("app/api/verify/certificate-design/route.ts");
const verify = read("app/verify/page.tsx");
const policy = read("docs/sql/rc1-system-settings-privacy.CANDIDATE.sql");

test("public verification no longer queries private system_settings directly", () => {
  assert.match(verify, /fetch\("\/api\/verify\/certificate-design"/);
  assert.doesNotMatch(verify, /\.from\(["']system_settings["']\)/);
});

test("published design is a fixed-scope read-only server endpoint", () => {
  assert.match(route, /export async function GET\(/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /\.eq\("is_default", true\)/);
  assert.match(route, /Object\.keys\(DEFAULT_TEMPLATE_SETTINGS\)/);
  assert.match(route, /PUBLIC_ELEMENT_KEYS/);
  assert.match(route, /normalizeSignatureComposition/);
  assert.match(route, /Cache-Control/);
  assert.doesNotMatch(route, /\.from\("members"\)/);
});

test("RLS candidate restricts public settings but keeps public UI keys", () => {
  assert.match(policy, /DROP POLICY IF EXISTS pr55_stage_public_read_system_settings/);
  assert.match(policy, /FOR SELECT TO anon, authenticated/);
  assert.match(policy, /key IN \('public_marquee', 'public_maintenance'\)/);
  assert.match(policy, /rc1_registry_admin_system_settings_select/);
  assert.match(policy, /public\.registration_is_admin\(\)/);
  assert.match(policy, /rc1_registry_admin_public_site_settings_insert/);
  assert.match(policy, /rc1_registry_admin_public_site_settings_update/);
  assert.doesNotMatch(policy, /USING \(true\)/);
});
