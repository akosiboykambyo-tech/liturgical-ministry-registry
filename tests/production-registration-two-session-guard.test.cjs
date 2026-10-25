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

test("refuses wrong database path even on the isolated staging host", () => {
  refused({
    PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL:
      "postgresql://postgres:synthetic-not-a-password@db.rtptybxugjhvpfjvcvgw.supabase.co:5432/other_database"
  });
});

test("refuses unexpected libpq URL options on the isolated staging host", () => {
  refused({
    PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL: fakeStaging + "?sslmode=require&host=outside.example.org"
  });
});

const fakeSessionPooler = "postgresql://postgres.rtptybxugjhvpfjvcvgw:synthetic-not-a-password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";
function configurationAccepted(url,expectedMode) {
  const child = spawnSync(process.execPath, [script, "--validate-config"], {
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      PR55_ALLOW_TWO_SESSION_TEST: optIn,
      PR55_STAGING_DATABASE_URL: url
    },
    encoding: "utf8", timeout: 5000
  });
  assert.equal(child.status, 0, "Valid staging mode must pass offline validation");
  assert.match(child.stdout, new RegExp("isolated staging " + expectedMode + " connection configuration accepted"));
  assert.match(child.stdout, /NO connection made/);
  assert.doesNotMatch(child.stdout + child.stderr, /synthetic-not-a-password/);
}

test("accepts the exact isolated staging project's session-pooler tenant without opening a connection", () => {
  configurationAccepted(fakeSessionPooler, "SESSION POOLER");
});

test("accepts the isolated staging direct endpoint without opening a connection", () => {
  configurationAccepted(fakeStaging + "?sslmode=require", "DIRECT");
});

test("rejects session-pooler transaction mode on port 6543", () => {
  refused({ PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL: fakeSessionPooler.replace(":5432/", ":6543/")
  });
});

test("rejects production tenant on a valid session-pooler hostname", () => {
  refused({ PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL: fakeSessionPooler.replace(
      "postgres.rtptybxugjhvpfjvcvgw:", "postgres.zlvofcwnpdzfdnipvbbd:")
  });
});

test("rejects wrong-region session-pooler hostname", () => {
  refused({ PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL: fakeSessionPooler.replace(
      "ap-northeast-1", "ap-southeast-2")
  });
});

test("rejects disabled TLS on session pooler", () => {
  refused({ PR55_ALLOW_TWO_SESSION_TEST: optIn,
    PR55_STAGING_DATABASE_URL: fakeSessionPooler.replace("sslmode=require", "sslmode=disable")
  });
});

test("refuses committed-revocation probe without a second explicit staging-only opt-in", () => {
  const child = spawnSync(process.execPath, [script, "--committed-probe"], {
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      PR55_ALLOW_TWO_SESSION_TEST: optIn,
      PR55_STAGING_DATABASE_URL: fakeSessionPooler,
    },
    encoding: "utf8", timeout: 5000
  });
  assert.equal(child.status, 2);
  assert.match(child.stderr, /REFUSED: committed probe requires explicit/);
  assert.doesNotMatch(child.stderr, /synthetic-not-a-password/);
});

test("committed-revocation candidate is scoped to a disposable shadow admin table", () => {
  const source = require("node:fs").readFileSync(script, "utf8");
  assert.match(source, /const probeTable = "registry_private.pr55_admin_probe_" \+ suffix/);
  assert.match(source, /candidateWithShadowGrant = functionDefinition.replace/);
  assert.match(source, /PROBE_REVOCATION_COMMITTED/);
  assert.match(source, /PROBE_TABLE_DROPPED/);
});

const httpScript = path.join(__dirname, "../scripts/pr55-staging-http-jwt-smoke.cjs");
test("HTTP smoke refuses absent staging-only opt-in", () => {
  const child = spawnSync(process.execPath, [httpScript], {
    env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" },
    encoding:"utf8", timeout:5000
  });
  assert.equal(child.status,2);
  assert.match(child.stderr,/^REFUSED:/);
});
test("HTTP smoke rejects missing publishable key without making a request", () => {
  const child = spawnSync(process.execPath, [httpScript,"--validate-config"], {
    env: { PATH:process.env.PATH || "", SystemRoot:process.env.SystemRoot || "",
      PR55_ALLOW_HTTP_TEST:"I_ACCEPT_READONLY_STAGING_HTTP_JWT_TEST",
      PR55_STAGING_AUTH_EMAIL:"placeholder@example.invalid",
      PR55_STAGING_AUTH_PASSWORD:"synthetic-not-a-password"
    }, encoding:"utf8",timeout:5000
  });
  assert.equal(child.status,2);
  assert.match(child.stderr,/^REFUSED:/);
  assert.doesNotMatch(child.stderr,/synthetic-not-a-password/);
});
test("HTTP smoke validates staging-only publishable key without making requests", () => {
  const child = spawnSync(process.execPath, [httpScript,"--validate-config"], {
    env: { PATH:process.env.PATH || "", SystemRoot:process.env.SystemRoot || "",
      PR55_ALLOW_HTTP_TEST:"I_ACCEPT_READONLY_STAGING_HTTP_JWT_TEST",
      PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_OFFLINE_FAKE_ONLY",
      PR55_STAGING_AUTH_EMAIL:"placeholder@example.invalid",
      PR55_STAGING_AUTH_PASSWORD:"synthetic-not-a-password"
    },encoding:"utf8",timeout:5000
  });
  assert.equal(child.status,0);
  assert.match(child.stdout,/NO requests made/);
  assert.doesNotMatch(child.stdout + child.stderr,/synthetic-not-a-password/);
});
