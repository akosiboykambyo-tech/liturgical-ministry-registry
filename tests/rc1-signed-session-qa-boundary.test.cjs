const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fullPath = (file) => path.join(__dirname, "..", file);
const read = (file) => fs.readFileSync(fullPath(file), "utf8");

test("RC1 release source excludes all temporary signed-session QA routes", () => {
  for (const filename of [
    "app/rc1-qa/page.tsx",
    "app/rc1-qa/rc1-qa-client.tsx",
    "app/release-qa/page.tsx",
    "app/release-qa/release-qa-client.tsx",
    "app/release-qa/certificate-persistence-qa.tsx",
    "app/release-qa/negative-access-qa.tsx",
    "app/release-qa/storage-transfer-qa.tsx",
  ]) {
    assert.equal(fs.existsSync(fullPath(filename)), false, filename);
  }
});

test("Retained financial read-only access verifies bearer JWT and exact role grants", () => {
  const route = read("app/api/financial-stewardship/access/route.ts");
  assert.match(route, /headers\.get\("authorization"\)/);
  assert.match(route, /auth\.getUser\(token\)/);
  assert.match(route, /\.from\("fs_staff_grants"\)/);
  assert.match(route, /\.eq\("user_id", verified\.data\.user\.id\)/);
  assert.match(route, /\.is\("revoked_at", null\)/);
  assert.match(route, /return respond\(403/);
  assert.match(route, /return respond\(503/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/);
});

test("Registry admin writes and secure verification still call guarded RPCs", () => {
  const writer = read("lib/registry-admin-writes.ts");
  const verifier = read("lib/secure-ministry-verification.ts");
  assert.match(writer, /registry_admin_member_write_v1/);
  assert.match(verifier, /registry_verify_ministries_v3/);
  assert.match(verifier, /NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION === "enabled"/);
  assert.doesNotMatch(verifier, /\.from\("members"\)\.update\(/);
});
