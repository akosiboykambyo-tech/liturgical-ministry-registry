/**
 * PR #55: independent PostgreSQL-backend staging race harness.
 * Run only with private direct-connection credentials for the isolated TEST project.
 * Two independent psql processes are used; all SQL changes are rolled back.
 * No administrator UUID/password/JWT is logged or persisted.
 */
"use strict";
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STAGING_HOST = "db.rtptybxugjhvpfjvcvgw.supabase.co";
const dbUrl = process.env.PR55_STAGING_DATABASE_URL || "";
const optIn = "I_ACCEPT_ISOLATED_STAGING_ROLLBACK_TESTS";
if (process.env.PR55_ALLOW_TWO_SESSION_TEST !== optIn) {
  console.error("REFUSED: explicit PR55_ALLOW_TWO_SESSION_TEST opt-in is required.");
  process.exit(2);
}
let parsedUrl;
try { parsedUrl = new URL(dbUrl); } catch {
  console.error("REFUSED: missing/invalid isolated staging DB connection URL.");
  process.exit(2);
}
if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    parsedUrl.hostname !== STAGING_HOST ||
    parsedUrl.port && parsedUrl.port !== "5432") {
  console.error("REFUSED: only the exact isolated staging direct DB host is accepted.");
  process.exit(2);
}
if (!parsedUrl.username || !parsedUrl.password) {
  console.error("REFUSED: staging DB credentials are missing.");
  process.exit(2);
}
const sqlSource = fs.readFileSync(
  path.join(__dirname, "../docs/sql/registration-staging-intake-function.ISOLATED-ONLY.sql"),
  "utf8"
);
const begin = sqlSource.indexOf("CREATE OR REPLACE FUNCTION public.registration_intake_v1(");
const marker = sqlSource.indexOf("AS $fn$", begin);
const end = sqlSource.indexOf("$fn$;", marker + 7);
if (begin < 0 || marker < 0 || end < 0)
  throw new Error("Candidate function could not be located. Refusing test.");
const functionDefinition = sqlSource.slice(begin, end + 5);
assert.match(functionDefinition, /FOR SHARE/);
assert.match(functionDefinition, /registry_private\.registration_administrators/);
const suffix = randomBytes(6).toString("hex");
const firstName = "PR55LOCK" + suffix;
const lastName = "Probe" + suffix;
const parish = "Isolated PR55 Race";
const quote = value => "'" + value.replace(/'/g, "''") + "'";

class SqlSession {
  constructor(label) {
    this.label = label;
    this.pending = null;
    this.buffer = "";
    this.closed = false;
    this.errors = "";
    // Never place the credential-bearing database URL in command line arguments.
    this.child = spawn("psql",
      ["-X", "-q", "-A", "-t", "-P", "pager=off", "-v", "ON_ERROR_STOP=1"], {
        env: {
          PATH: process.env.PATH || "",
          SystemRoot: process.env.SystemRoot || "",
          PGDATABASE: dbUrl,
          PGSSLMODE: "require",
          PGCONNECT_TIMEOUT: "10",
          PGAPPNAME: "pr55_two_session_" + label
        }, stdio: ["pipe", "pipe", "pipe"]
      });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk.toString("utf8");
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop();
      for (const line of lines) {
        if (!this.pending) continue;
        if (line.trim() === this.pending.marker) {
          const job = this.pending;
          this.pending = null;
          clearTimeout(job.timeout);
          job.resolve(job.lines);
        } else {
          jobLine(this.pending, line);
        }
      }
    });
    this.child.stderr.on("data", chunk => {
      // Error details from PostgreSQL can include values. Never echo them.
      this.errors += chunk.toString("utf8").slice(0, 1000);
    });
    this.child.on("error", () => this.abort("psql could not be started"));
    this.child.on("exit", () => this.abort("psql session ended unexpectedly"));
  }
  abort(message) {
    this.closed = true;
    if (this.pending) {
      clearTimeout(this.pending.timeout);
      this.pending.reject(new Error(this.label + ": " + message));
      this.pending = null;
    }
  }
  command(sql, name) {
    if (this.closed || this.pending) return Promise.reject(new Error("Session unavailable: " + this.label));
    const token = "PR55_" + this.label + "_" + name;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error(this.label + ": command deadline exceeded"));
        this.child.kill();
      }, 20000);
      this.pending = { marker: token, lines: [], resolve, reject, timeout };
      this.child.stdin.write(sql.trimEnd() + "\n\\echo " + token + "\n");
    });
  }
  finish() {
    if (!this.closed) this.child.stdin.write("ROLLBACK;\n\\q\n");
    setTimeout(() => { if (!this.closed) this.child.kill(); }, 1200).unref();
  }
}
function jobLine(job, line) { job.lines.push(line.trim()); }
function getPid(lines) {
  const pid = lines.find(x => /^\d+$/.test(x));
  if (!pid) throw new Error("Could not confirm distinct PostgreSQL backend PID");
  return pid;
}

async function main() {
  const a = new SqlSession("A");
  const b = new SqlSession("B");
  let aOpen = false, bOpen = false;
  try {
    const [pidALines, pidBLines] = await Promise.all([
      a.command("SELECT pg_backend_pid();", "PID"),
      b.command("SELECT pg_backend_pid();", "PID")
    ]);
    assert.notEqual(getPid(pidALines), getPid(pidBLines),
      "Two genuinely independent PostgreSQL connections required");
    // Preflight never mutates anything. Abort on ambiguous admin grant state.
    await a.command([
      "DO $preflight$",
      "BEGIN",
      " IF (SELECT count(*) FROM registry_private.registration_administrators",
      "     WHERE active AND revoked_at IS NULL) <> 1",
      " THEN RAISE EXCEPTION 'Expected exactly one test admin'; END IF;",
      " IF current_user <> 'postgres' THEN",
      "   RAISE EXCEPTION 'Must use a privileged isolated staging DB role';",
      " END IF;",
      "END $preflight$;"
    ].join("\n"), "PREFLIGHT");

    // Install candidate RPC only *inside session B's uncommitted transaction*.
    // This is not a persistent staging deployment and cannot touch production.
    await b.command([
      "BEGIN;",
      "SET LOCAL statement_timeout = '12000ms';",
      functionDefinition,
      "DO $identity$",
      "DECLARE v_actor uuid;",
      "BEGIN",
      " SELECT user_id INTO v_actor FROM registry_private.registration_administrators",
      " WHERE active AND revoked_at IS NULL LIMIT 1;",
      " IF v_actor IS NULL THEN RAISE EXCEPTION 'No active staging admin'; END IF;",
      " PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);",
      "END $identity$;"
    ].join("\n"), "CANDIDATE_READY");
    bOpen = true;

    // In A, an uncommitted administrator revocation holds the row lock.
    await a.command([
      "BEGIN;",
      "SET LOCAL statement_timeout = '12000ms';",
      "DO $hold$",
      "DECLARE n integer;",
      "BEGIN",
      " UPDATE registry_private.registration_administrators SET active=false",
      " WHERE active AND revoked_at IS NULL;",
      " GET DIAGNOSTICS n = ROW_COUNT;",
      " IF n <> 1 THEN RAISE EXCEPTION 'Could not lock one admin grant'; END IF;",
      "END $hold$;"
    ].join("\n"), "REVOCATION_HELD");
    aOpen = true;

    // Under the old RPC, this could proceed using the previously committed
    // grant version. The PR55 candidate must WAIT and then hit lock_timeout.
    await b.command([
      "SET LOCAL lock_timeout = '900ms';",
      "DO $probe$",
      "DECLARE v_blocked boolean := false;",
      "BEGIN",
      " BEGIN",
      "  PERFORM public.registration_intake_v1(gen_random_uuid(),",
      "    " + quote(firstName) + "," + quote(lastName) + "," + quote(parish) + ",",
      "    ARRAY['Mother Butler Guild'],2026);",
      " EXCEPTION WHEN lock_not_available THEN v_blocked := true; END;",
      " IF NOT v_blocked THEN",
      "  RAISE EXCEPTION 'RPC did not block while revocation row was locked';",
      " END IF;",
      "END $probe$;"
    ].join("\n"), "LOCK_BLOCKING_PROVED");

    // Abort synthetic revocation: the administrator record is restored.
    await a.command("ROLLBACK;", "REVOCATION_ROLLED_BACK");
    aOpen = false;

    // With the lock gone, the same candidate RPC can create/replay a fixture,
    // but this entire B transaction will also be rolled back.
    await b.command([
      "SET LOCAL lock_timeout = '5000ms';",
      "DO $resume$",
      "DECLARE r jsonb; again jsonb; k uuid := gen_random_uuid();",
      "BEGIN",
      " r := public.registration_intake_v1(k,",
      "   " + quote(firstName) + "," + quote(lastName) + "," + quote(parish) + ",",
      "   ARRAY['Mother Butler Guild'],2026);",
      " IF r->>'status' <> 'created' THEN RAISE EXCEPTION 'Create not successful'; END IF;",
      " again := public.registration_intake_v1(k,",
      "   " + quote(firstName) + "," + quote(lastName) + "," + quote(parish) + ",",
      "   ARRAY['Mother Butler Guild'],2026);",
      " IF again->>'status' <> 'replayed' THEN RAISE EXCEPTION 'Replay failed'; END IF;",
      "END $resume$;"
    ].join("\n"), "RESUMED_AFTER_ABORT");
    await b.command("ROLLBACK;", "ALL_TEST_WRITES_ROLLED_BACK");
    bOpen = false;

    // Check from the *other connection* that no member or grant change remains.
    await a.command([
      "DO $verify$",
      "BEGIN",
      " IF EXISTS (SELECT 1 FROM public.members WHERE first_name=" + quote(firstName) + ")",
      " THEN RAISE EXCEPTION 'Synthetic member persisted unexpectedly'; END IF;",
      " IF (SELECT count(*) FROM registry_private.registration_administrators",
      "  WHERE active AND revoked_at IS NULL) <> 1",
      " THEN RAISE EXCEPTION 'Staging administrator grant was modified'; END IF;",
      "END $verify$;"
    ].join("\n"), "AFTER_COUNTS");
    console.log("PASS: two distinct PostgreSQL backend sessions");
    console.log("PASS: candidate RPC blocked by simultaneous uncommitted grant revocation");
    console.log("PASS: RPC create/replay after revoked transaction rolled back");
    console.log("PASS: no persistent member/administrator changes; both transactions rolled back");
    console.log("LIMIT: committed revocation and authenticated HTTP races still require separate QA");
  } finally {
    // Disconnecting a PostgreSQL backend also rolls back an open transaction.
    if (aOpen) { try { await a.command("ROLLBACK;", "EMERGENCY_A"); } catch {} }
    if (bOpen) { try { await b.command("ROLLBACK;", "EMERGENCY_B"); } catch {} }
    a.finish();
    b.finish();
  }
}
main().catch(e => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
