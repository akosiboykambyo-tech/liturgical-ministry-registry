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

const candidateHttpScript = path.join(__dirname, "../scripts/pr55-staging-candidate-http-rehearsal.cjs");
const candidateOptIn = "I_ACCEPT_ISOLATED_STAGING_TEMPORARY_RPCS";
const fakeCandidateUrl = "postgresql://postgres.rtptybxugjhvpfjvcvgw:synthetic-not-a-password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";
function candidateGuard(args,env,status) {
  const child=spawnSync(process.execPath,[candidateHttpScript,...args],{
    env:{PATH:process.env.PATH||"",SystemRoot:process.env.SystemRoot||"",...env},
    encoding:"utf8",timeout:5000
  });
  assert.equal(child.status,status);
  assert.doesNotMatch(child.stdout+child.stderr,/synthetic-not-a-password/);
  return child;
}
test("candidate JWT rehearsal refuses missing explicit staging RPC opt-in",()=>{
  const child=candidateGuard(["--validate-config"],{
    PR55_STAGING_DATABASE_URL:fakeCandidateUrl
  },2);
  assert.match(child.stderr,/REFUSED:/);
});
test("candidate JWT rehearsal refuses production DB even when opted in",()=>{
  const child=candidateGuard(["--validate-config"],{
    PR55_ALLOW_CANDIDATE_HTTP_PROBE:candidateOptIn,
    PR55_STAGING_DATABASE_URL:
      "postgresql://postgres.zlvofcwnpdzfdnipvbbd:synthetic-not-a-password@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
  },2);
  assert.match(child.stderr,/REFUSED:/);
});
test("candidate JWT rehearsal validates isolated staging configuration offline",()=>{
  const child=candidateGuard(["--validate-config"],{
    PR55_ALLOW_CANDIDATE_HTTP_PROBE:candidateOptIn,
    PR55_STAGING_DATABASE_URL:fakeCandidateUrl,
    PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_SYNTHETIC_OFFLINE_ONLY",
    PR55_STAGING_AUTH_EMAIL:"placeholder@example.invalid",
    PR55_STAGING_AUTH_PASSWORD:"synthetic-not-a-password"
  },0);
  assert.match(child.stdout,/no connection made/);
});
test("candidate JWT HTTP rehearsal requires forced rollback and cleanup",()=>{
  const content=require("node:fs").readFileSync(candidateHttpScript,"utf8");
  assert.match(content,/PR55_ROLLBACK_SENTINEL/);
  assert.match(content,/EXCEPTION WHEN raise_exception THEN/);
  assert.match(content,/allWritesRolledBack/);
  assert.match(content,/REVOKE ALL ON FUNCTION.*FROM PUBLIC,anon,authenticated/);
  assert.match(content,/--cleanup-only/);
  assert.match(content,/DROP FUNCTION IF EXISTS/);
});

test("candidate HTTP rehearsal rejects a half-configured non-admin identity",()=>{
  const child=candidateGuard(["--validate-config"],{
    PR55_ALLOW_CANDIDATE_HTTP_PROBE:candidateOptIn,
    PR55_STAGING_DATABASE_URL:fakeCandidateUrl,
    PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_SYNTHETIC_OFFLINE_ONLY",
    PR55_STAGING_AUTH_EMAIL:"admin@example.invalid",
    PR55_STAGING_AUTH_PASSWORD:"synthetic-not-a-password",
    PR55_STAGING_NONADMIN_AUTH_EMAIL:"unprivileged@example.invalid"
  },2);
  assert.match(child.stderr,/non-admin Auth email and password are required/);
});
test("candidate HTTP rehearsal supports an independently configured staging non-admin identity",()=>{
  const child=candidateGuard(["--validate-config"],{
    PR55_ALLOW_CANDIDATE_HTTP_PROBE:candidateOptIn,
    PR55_STAGING_DATABASE_URL:fakeCandidateUrl,
    PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_SYNTHETIC_OFFLINE_ONLY",
    PR55_STAGING_AUTH_EMAIL:"admin@example.invalid",
    PR55_STAGING_AUTH_PASSWORD:"synthetic-not-a-password",
    PR55_STAGING_NONADMIN_AUTH_EMAIL:"unprivileged@example.invalid",
    PR55_STAGING_NONADMIN_AUTH_PASSWORD:"synthetic-not-a-password"
  },0);
  assert.match(child.stdout,/no connection made/);
});
test("candidate non-admin HTTP gate verifies separate JWT, false admin status and SQLSTATE 42501",()=>{
  const source=require("node:fs").readFileSync(candidateHttpScript,"utf8");
  assert.match(source,/assert\.notEqual\(id\.data\?\.id,identity\.data\?\.id/);
  assert.match(source,/assert\.equal\(grant\.data,false/);
  assert.match(source,/assert\.equal\(denied\.data\?\.code,"42501"/);
});

test("candidate read-only connection check requires the same explicit staging-only opt-in",()=>{
  const child=candidateGuard(["--connection-check"],{
    PR55_STAGING_DATABASE_URL:fakeCandidateUrl
  },2);
  assert.match(child.stderr,/REFUSED:/);
});
test("candidate read-only connection check rejects production database project",()=>{
  const child=candidateGuard(["--connection-check"],{
    PR55_ALLOW_CANDIDATE_HTTP_PROBE:candidateOptIn,
    PR55_STAGING_DATABASE_URL:
      "postgresql://postgres.zlvofcwnpdzfdnipvbbd:synthetic-not-a-password@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
  },2);
  assert.match(child.stderr,/REFUSED:/);
});
test("candidate SQL stage uses bounded connection, lock and statement timeouts",()=>{
  const source=require("node:fs").readFileSync(candidateHttpScript,"utf8");
  assert.match(source,/PGCONNECT_TIMEOUT:"10"/);
  assert.match(source,/timeout:45000/);
  assert.match(source,/SET LOCAL statement_timeout='20000ms'/);
  assert.match(source,/SET LOCAL lock_timeout='5s'/);
  assert.match(source,/installAttempted=true/);
  assert.match(source,/if\(installAttempted\)/);
  assert.match(source,/DROP FUNCTION IF EXISTS/);
});

test("candidate local psql check never needs credentials or attempts database access",()=>{
  const child=spawnSync(process.execPath,[candidateHttpScript,"--check-psql"],{
    env:{
      PATH:process.env.PATH||process.env.Path||"",
      SystemRoot:process.env.SystemRoot||""
    },encoding:"utf8",timeout:8000
  });
  assert.ok([0,1].includes(child.status),
    "local executable check should return a controlled status");
  const output=child.stdout+child.stderr;
  assert.match(output,/psql executable/);
  assert.match(output,/no database connection/);
  assert.doesNotMatch(output,/password|postgresql:\/\//i);
});
test("candidate harness favors known PostgreSQL 18 Windows executable and diagnoses ENOENT",()=>{
  const source=require("node:fs").readFileSync(candidateHttpScript,"utf8");
  assert.match(source,/KNOWN_WINDOWS_PSQL/);
  assert.match(source,/PSQL_BIN=process\.platform==="win32"/);
  assert.match(source,/const proc=spawnSync\(PSQL_BIN,/);
  assert.match(source,/code==="ENOENT"/);
  assert.match(source,/classifySpawnResult\(proc\)/);
});

const prodBackupScript=path.join(__dirname,"../scripts/pr55-production-readonly-backup.cjs");
function backupOffline(env,status){
  const child=spawnSync(process.execPath,[prodBackupScript,"--backup"],{
    env:{PATH:process.env.PATH||"",SystemRoot:process.env.SystemRoot||"",...env},
    encoding:"utf8",timeout:5000
  });
  assert.equal(child.status,status);
  assert.doesNotMatch(child.stdout+child.stderr,/synthetic-not-a-password/);
  return child;
}
test("production backup refuses missing explicit opt-in without attempting export",()=>{
  const child=backupOffline({},2);
  assert.match(child.stderr,/^REFUSED:/);
});
test("production backup refuses staging pooler and staging tenant even with opt-in",()=>{
  const child=backupOffline({
    PR55_ALLOW_PRODUCTION_BACKUP:"I_ACCEPT_READONLY_PRODUCTION_LOGICAL_BACKUP",
    PR55_PRODUCTION_DATABASE_URL:
      "postgresql://postgres.rtptybxugjhvpfjvcvgw:synthetic-not-a-password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
  },2);
  assert.match(child.stderr,/^REFUSED:/);
});
test("production backup rejects wrong protocol/port/TLS before any export",()=>{
  const child=backupOffline({
    PR55_ALLOW_PRODUCTION_BACKUP:"I_ACCEPT_READONLY_PRODUCTION_LOGICAL_BACKUP",
    PR55_PRODUCTION_DATABASE_URL:
      "postgresql://postgres.zlvofcwnpdzfdnipvbbd:synthetic-not-a-password@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=disable"
  },2);
  assert.match(child.stderr,/^REFUSED:/);
});
test("production backup forces read-only exact production target and local confidential path",()=>{
  const source=require("node:fs").readFileSync(prodBackupScript,"utf8");
  assert.match(source,/HOST_PATTERN=\/\^aws-/);
  assert.match(source,/PGHOST:url\.hostname/);
  assert.doesNotMatch(source,/const HOST="aws-0-/);
  assert.match(source,/const REF="zlvofcwnpdzfdnipvbbd"/);
  assert.match(source,/BEGIN TRANSACTION READ ONLY/);
  assert.doesNotMatch(source,/PGOPTIONS:/);
  assert.match(source,/--format=custom/);
  assert.match(source,/--no-password/);
  assert.match(source,/archiveDir=path\.join\(os\.homedir\(\)/);
  assert.match(source,/createHash\("sha256"\)/);
  assert.match(source,/TABLE DATA auth users/);
  assert.match(source,/TABLE DATA storage objects/);
  assert.match(source,/restore NOT proven/);
});
test("production backup local tool preflight does not require a DB URL",()=>{
  const child=spawnSync(process.execPath,[prodBackupScript,"--check-tools"],{
    env:{PATH:process.env.PATH||"",SystemRoot:process.env.SystemRoot||""},
    encoding:"utf8",timeout:5000
  });
  assert.ok([0,1].includes(child.status));
  assert.match(child.stdout+child.stderr,/pg_dump|PostgreSQL dump/i);
  assert.doesNotMatch(child.stdout+child.stderr,/postgresql:\/\/|synthetic-not-a-password/);
});

test("production connection check refuses execution without explicit production-only opt-in",()=>{
  const child=spawnSync(process.execPath,[prodBackupScript,"--connection-check"],{
    env:{PATH:process.env.PATH||"",SystemRoot:process.env.SystemRoot||""},
    encoding:"utf8",timeout:5000
  });
  assert.equal(child.status,2);
  assert.match(child.stderr,/REFUSED:/);
});
test("production connection check blocks staging and non-TLS targets before psql starts",()=>{
  const child=spawnSync(process.execPath,[prodBackupScript,"--connection-check"],{
    env:{
      PATH:process.env.PATH||"",SystemRoot:process.env.SystemRoot||"",
      PR55_ALLOW_PRODUCTION_BACKUP:"I_ACCEPT_READONLY_PRODUCTION_LOGICAL_BACKUP",
      PR55_PRODUCTION_DATABASE_URL:
        "postgresql://postgres.rtptybxugjhvpfjvcvgw:synthetic-not-a-password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=disable"
    },encoding:"utf8",timeout:5000
  });
  assert.equal(child.status,2);
  assert.match(child.stderr,/REFUSED:/);
  assert.doesNotMatch(child.stderr,/synthetic-not-a-password/);
});
test("production connection diagnostic asserts read-only before any export",()=>{
  const src=require("node:fs").readFileSync(prodBackupScript,"utf8");
  assert.match(src,/process\.argv\.includes\("--connection-check"\)/);
  assert.match(src,/BEGIN TRANSACTION READ ONLY/);
  assert.match(src,/current_setting\('transaction_read_only'\)/);
  assert.match(src,/ROLLBACK;/);
  assert.match(src,/status!=="READONLY_OK"/);
  assert.match(src,/--command/);
  assert.match(src,/no backup or writes made/);
});
test("production backup categorizes pg_dump errors without disclosing raw stderr",()=>{
  const src=require("node:fs").readFileSync(prodBackupScript,"utf8");
  const match=src.match(/function classifyBackupFailure\(result\) \{[\s\S]*?\n\}/);
  assert.ok(match,"expected bounded pure error classification helper");
  const classifier=require("node:vm").runInNewContext("("+match[0]+")");
  assert.match(classifier({status:1,stderr:"pg_dump: error: connection failed: FATAL: password authentication failed for user postgres.zlvofcwnpdzfdnipvbbd"}),/authentication rejected/);
  assert.match(classifier({status:1,stderr:"pg_dump: error: query failed: ERROR: permission denied for table users"}),/object privileges/);
  assert.match(classifier({status:1,stderr:"pg_dump: error: query would be affected by row-level security policy for table members"}),/row-level security/);
  assert.match(classifier({status:1,stderr:"pg_dump: error: permission denied for large object 12345"}),/large-object/);
  assert.match(classifier({status:null,error:{code:"ETIMEDOUT"},stderr:"password=TOP_SECRET"}),/timeout|timed out/);
  assert.doesNotMatch(classifier({status:1,stderr:"password=TOP_SECRET; user email=private"}),/TOP_SECRET|private/);
});

test("production backup guards keep hostname strictly within Sydney shared pooler cluster domain",()=>{
  const src=require("node:fs").readFileSync(prodBackupScript,"utf8");
  const match=src.match(/const HOST_PATTERN=(\/\^aws-[^;]+);/);
  assert.ok(match,"expected explicit host allowlist");
  const re=require("node:vm").runInNewContext(match[1]);
  assert.ok(re.test("aws-0-ap-southeast-2.pooler.supabase.com"));
  assert.ok(re.test("aws-1-ap-southeast-2.pooler.supabase.com"));
  assert.ok(re.test("aws-12-ap-southeast-2.pooler.supabase.com"));
  assert.ok(!re.test("aws-0-ap-northeast-1.pooler.supabase.com"));
  assert.ok(!re.test("aws-0-us-east-1.pooler.supabase.com"));
  assert.ok(!re.test("aws-1-ap-southeast-2.pooler.supabase.com.evil.example"));
  assert.match(src,/url\.username!==USER/);
  assert.match(src,/url\.searchParams\.get\("sslmode"\)!=="require"/);
  assert.match(src,/url\.port!=="5432"/);
});

test("production read-only backup uses pg_dump's transaction-scoped read-only mode instead of persistent pool defaults",()=>{
  const src=require("node:fs").readFileSync(prodBackupScript,"utf8");
  assert.match(src,/BEGIN TRANSACTION READ ONLY; SELECT CASE/);
  assert.match(src,/ROLLBACK;/);
  assert.match(src,/--command/);
  assert.match(src,/PGHOST:url\.hostname/);
  assert.match(src,/--format=custom/);
  assert.doesNotMatch(src,/PGOPTIONS:|SET SESSION CHARACTERISTICS AS TRANSACTION|SET default_transaction_read_only/);
});
