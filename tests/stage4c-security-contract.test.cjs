"use strict";

// Offline, source-only contract tests. These DO NOT connect to Supabase,
// Docker, V3, TEST, or PROD. The SQL assertions require a separate clone.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(
  root, "supabase/migrations",
  "202611190001_stage4c_lock_down_login_and_remove_test_member_policy.sql"
), "utf8");
const signIn = fs.readFileSync(path.join(
  root, "app/api/admin/sign-in/route.ts"
), "utf8");
const postMigrationChecks = fs.readFileSync(path.join(
  root, "supabase/tests/stage4c_security_readonly_assertions.sql"
), "utf8");

test("the security migration has explicit preflight and one transaction", () => {
  assert.match(migration, /\bBEGIN;/i);
  assert.match(migration, /\bCOMMIT;/i);
  assert.match(migration, /to_regprocedure\('public\.admin_login_begin\(text,uuid\)'\)/);
  assert.match(migration, /to_regprocedure\('public\.admin_login_finish\(text,uuid,boolean\)'\)/);
  assert.match(migration, /relrowsecurity/);
});

test("the fixed-identity SELECT policy is removed", () => {
  assert.match(migration,
    /DROP POLICY IF EXISTS test_admin_read_members ON public\.members;/);
  assert.match(postMigrationChecks, /policyname='test_admin_read_members'/);
});

test("both privileged login RPCs deny application-role direct EXECUTE", () => {
  for (const sig of [
    "public.admin_login_begin(text,uuid)",
    "public.admin_login_finish(text,uuid,boolean)"
  ]) {
    const escaped = sig.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
    assert.match(migration, new RegExp(
      "REVOKE EXECUTE ON FUNCTION " + escaped +
      "\\s+FROM PUBLIC, anon, authenticated;", "i"
    ));
    assert.match(migration, new RegExp(
      "GRANT EXECUTE ON FUNCTION " + escaped +
      "\\s+TO service_role;", "i"
    ));
    assert.ok(postMigrationChecks.includes(sig));
  }
});

test("a hard-coded test-only lookup is disabled for app roles when present", () => {
  assert.match(migration,
    /to_regprocedure\('public\.registration_lookup_preflight\(\)'\)/);
  assert.match(migration,
    /REVOKE EXECUTE ON FUNCTION public\.registration_lookup_preflight\(\) FROM PUBLIC, anon, authenticated, service_role/);
});

test("the Next.js login handler uses the trusted service-key client for RPCs", () => {
  assert.match(signIn, /const serviceKey = process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(signIn, /const admin = createClient\(url, serviceKey/);
  assert.match(signIn, /admin\.rpc\("admin_login_begin"/);
  assert.match(signIn, /admin\.rpc\("admin_login_finish"/);
  assert.doesNotMatch(signIn, /auth\.rpc\("admin_login_(begin|finish)"/);
});

test("no settings policy is silently changed before key classification", () => {
  assert.doesNotMatch(migration, /system_settings/i);
});
