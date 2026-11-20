const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const api = read("app/api/verify/route.ts");
const migration = read("docs/sql/rc1-test-verification-rate-limit-restore.CANDIDATE.sql");
const rollback = read("docs/sql/rc1-test-verification-rate-limit-restore.ROLLBACK.sql");

test("public /api/verify fails closed if database-backed rate limit is absent", () => {
  assert.match(api, /"check_verification_rate_limit"/);
  assert.match(api, /if \(error \|\| !Array\.isArray\(data\)/);
  assert.match(api, /"Verification service unavailable\."/);
  assert.match(api, /return json\([\s\S]*?429/);
});

test("targeted staging repair restores only both service-only limiter functions", () => {
  assert.match(migration, /CREATE FUNCTION public\.check_verification_rate_limit\(/);
  assert.match(migration, /CREATE FUNCTION public\.cleanup_verification_rate_limits\(\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(migration, /\bCREATE TABLE\b/i);
  assert.doesNotMatch(migration, /\bDISABLE ROW LEVEL SECURITY\b/i);
  assert.doesNotMatch(migration, /\bGRANT EXECUTE\b[^;]*\bTO (?:anon|authenticated)\b/i);
});

test("rollback removes newly restored functions without touching table/data", () => {
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.check_verification_rate_limit/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.cleanup_verification_rate_limits/);
  assert.doesNotMatch(rollback, /\bDROP TABLE\b/i);
  assert.doesNotMatch(rollback, /\bDELETE FROM\b/i);
});
