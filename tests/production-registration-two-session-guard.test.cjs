const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const script = path.join(__dirname, "../scripts/pr55-staging-two-session-test.cjs");
const optIn = "I_ACCEPT_ISOLATED_STAGING_ROLLBACK_TESTS";
const fakeStaging = "postgresql://postgres:synthetic-not-a-password@db.rtptybxugjhvpfjvcvgw.supabase.co:5432/postgres";

function refused(overrides) {
  const env = {
    PATH: process.env.PATH || "",
    SystemRoot: process.env.SystemRoot || "",
    ...overrides
  };
  const child = spawnSync(process.execPath, [script], {
    env, encoding: "utf8", timeout: 5000
  });
  assert.equal(child.status, 2, "Guard should refuse before invoking psql");
  assert.match(child.stderr, /^REFUSED:/);
  assert.doesNotMatch(child.stderr, /synthetic-not-a-password/);
}

test("refuses missing explicit staging write-test opt-in", () => {
  refused({ PR55_STAGING_DATABASE_URL: fakeStaging });
});

test("refuses real production database host", () => {
  refused({
    PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL:
      "postgresql://postgres:synthetic-not-a-password@db.zlvofcwnpdzfdnipvbbd.supabase.co:5432/postgres"
  });
});

test("refuses unknown or pooled database hosts until independently approved", () => {
  refused({
    PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL:
      "postgresql://postgres:synthetic-not-a-password@pooler.example.com:5432/postgres"
  });
});

test("refuses URL connection strings that explicitly disable TLS", () => {
  refused({
    PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL: fakeStaging + "?sslmode=disable"
  });
});

test("refuses passwordless test connections", () => {
  refused({
    PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL:
      "postgresql://postgres@db.rtptybxugjhvpfjvcvgw.supabase.co:5432/postgres"
  });
});
