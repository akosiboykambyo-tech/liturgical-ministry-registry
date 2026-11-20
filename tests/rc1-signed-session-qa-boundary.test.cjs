const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (filename) => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
const server = read("app/rc1-qa/page.tsx");
const client = read("app/rc1-qa/rc1-qa-client.tsx");

test("QA page is inaccessible outside TEST-scoped Preview deployment", () => {
  assert.match(server, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(server, /hostname === "rtptybxugjhvpfjvcvgw\.supabase\.co"/);
  assert.match(server, /notFound\(\)/);
  assert.match(server, /robots: \{ index: false, follow: false \}/);
});

test("QA validates real JWT without sending credentials into reports", () => {
  assert.match(client, /supabase\.auth\.getUser\(token\)/);
  assert.match(client, /getSupabaseBrowserClient/);
  assert.match(client, /sessionResult\.data\.session\?\.access_token/);
  assert.match(client, /Authorization: "Bearer " \+ token/);
  assert.match(client, /getSession\(\)/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(client, /localStorage\.setItem|console\.log|sendBeacon/);
  assert.doesNotMatch(client, /clipboard\.writeText\(token\)|JSON\.stringify\(session/);
});

test("QA includes real HTTP endpoint, RLS and guard-first invalid probes", () => {
  assert.match(client, /\/api\/financial-stewardship\/access\?/);
  assert.match(client, /\.from\("fs_staff_grants"\)/);
  assert.match(client, /\.rpc\("registration_is_admin"\)/);
  assert.match(client, /"registry_admin_member_write_v1"/);
  assert.match(client, /"registration_intake_v1"/);
  assert.match(client, /"registration_resolve_review_v1"/);
  assert.match(client, /"fs_cowl_acknowledge_receipt_booklet"/);
  assert.match(client, /"fs_curia_assign_receipt_booklet"/);
  assert.match(client, /p_physically_checked: false/);
  assert.match(client, /p_handover_confirmed: false/);
  assert.match(client, /"inconclusive"/);
});
