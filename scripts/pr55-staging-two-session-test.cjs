/**
 * PR #55: independent PostgreSQL-backend staging race harness.
 * Run only with private direct or IPv4 Session-pooler credentials for the isolated TEST project.
 * Two independent psql processes are used; all SQL changes are rolled back.
 * No administrator UUID/password/JWT is logged or persisted.
 */
"use strict";
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STAGING_REF = "rtptybxugjhvpfjvcvgw";
const STAGING_DIRECT_HOST = "db." + STAGING_REF + ".supabase.co";
// Region confirmed from this exact TEST project. Supabase's shared pooler
// index varies; copy the complete host from the TEST project's Connect page.
const STAGING_SESSION_POOLER_HOST = /^aws-[0-9]+-ap-northeast-1\.pooler\.supabase\.com$/;
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
const isDirect = parsedUrl.hostname === STAGING_DIRECT_HOST;
const isSessionPooler = STAGING_SESSION_POOLER_HOST.test(parsedUrl.hostname);
if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    !(isDirect || isSessionPooler) ||
    (parsedUrl.port && parsedUrl.port !== "5432")) {
  console.error("REFUSED: only isolated staging direct or IPv4 Session-pooler port 5432 is accepted.");
  process.exit(2);
}
const sslModeInUrl = parsedUrl.searchParams.get("sslmode");
if (sslModeInUrl && !["require", "verify-ca", "verify-full"].includes(sslModeInUrl)) {
  console.error("REFUSED: staging connection must use encrypted PostgreSQL TLS.");
  process.exit(2);
}
if (!parsedUrl.username || !parsedUrl.password) {
  console.error("REFUSED: staging DB credentials are missing.");
  process.exit(2);
}
const expectedUsername = isSessionPooler ? "postgres." + STAGING_REF : "postgres";
if (parsedUrl.username !== expectedUsername || parsedUrl.pathname !== "/postgres") {
  console.error("REFUSED: staging connection username/project or database is incorrect.");
  process.exit(2);
}
let dbPassword;
try { dbPassword = decodeURIComponent(parsedUrl.password); }
catch {
  console.error("REFUSED: invalid password encoding in local staging URL.");
  process.exit(2);
}
if (!dbPassword || [...parsedUrl.searchParams.keys()].some(k => k !== "sslmode")) {
  console.error("REFUSED: invalid password or unexpected staging connection options.");
  process.exit(2);
}
if (process.argv.includes("--validate-config")) {
  console.log("PASS: isolated staging " +
    (isSessionPooler ? "SESSION POOLER" : "DIRECT") +
    " connection configuration accepted; NO connection made");
  process.exit(0);
}
if (process.argv.includes("--committed-probe") &&
    process.env.PR55_ALLOW_COMMITTED_PROBE !==
      "I_ACCEPT_DISPOSABLE_STAGING_SCHEMA_WRITES") {
  console.error("REFUSED: committed probe requires explicit disposable-staging-schema opt-in.");
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
    this.stage = "CONNECT";
    // Use libpq's individual PG* settings: PGDATABASE must be a database name,
    // not the credential-bearing connection URI. Never log the password.
    this.child = spawn("psql",
      ["-X", "-q", "-A", "-t", "-P", "pager=off",
       "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
        env: {
          PATH: process.env.Path || process.env.PATH || "",
          SystemRoot: process.env.SystemRoot || "",
          PGHOST: parsedUrl.hostname,
          PGPORT: "5432",
          PGDATABASE: "postgres",
          PGUSER: expectedUsername,
          PGPASSWORD: dbPassword,
          PGSSLMODE: "require",
          PGCONNECT_TIMEOUT: "10",
          PGAPPNAME: "pr55_two_session_" + label
        }, stdio: ["pipe", "pipe", "pipe"]
      });
    // A failed login may close stdin while the harness is still unwinding.
    // Node emits EPIPE asynchronously on the writable stream. Handle it
    // explicitly so we report the original authentication failure cleanly.
    this.child.stdin.on("error", () => {
      // Swallow expected EPIPE after early process exit. The child "exit"
      // handler reports the PostgreSQL cause once stderr has arrived.
      // If the process is still alive, the command deadline is a safeguard.
      this.inputClosed = true;
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
      // Some libpq errors can contain database URLs, account identifiers or
      // quoted values. Keep stderr private and report only allowlisted causes.
      this.errors = (this.errors + chunk.toString("utf8")).slice(-4000);
    });
    this.child.on("error", () => this.abort("psql could not start", null, null));
    this.child.on("exit", (code, signal) =>
      this.abort("psql stopped", code, signal));
  }
  abort(message, exitCode, signal) {
    if (this.closed) return;
    this.closed = true;
    if (this.pending) {
      const pending = this.pending;
      clearTimeout(pending.timeout);
      const cause = categorizeFailure(this.errors, exitCode, signal);
      pending.reject(new Error(
        this.label + " [" + pending.stage + "]: " + message + "; " + cause
      ));
      this.pending = null;
    }
  }
  command(sql, name) {
    if (this.closed || this.pending) return Promise.reject(new Error("Session unavailable: " + this.label));
    const token = "PR55_" + this.label + "_" + name;
    this.stage = name;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error(this.label + " [" + name + "]: command deadline exceeded; " +
          categorizeFailure(this.errors, null, null)));
        this.child.kill();
      }, 20000);
      this.pending = { marker: token, stage: name, lines: [], resolve, reject, timeout };
      // If psql exits early, the writable-stream error listener above
      // rejects the pending command without an unhandled EPIPE crash.
      if (this.child.stdin.destroyed || this.child.stdin.writableEnded ||
          this.child.exitCode !== null) {
        this.abort("psql not available for input", this.child.exitCode,
          this.child.signalCode);
        return;
      }
      this.child.stdin.write(sql.trimEnd() + "\n\\echo " + token + "\n");
    });
  }
  finish() {
    // Failed authentication exits before BEGIN; never write to a dead pipe.
    // An open transaction is rolled back by PostgreSQL on disconnect as well.
    if (!this.closed && this.child.exitCode === null &&
        !this.child.stdin.destroyed && !this.child.stdin.writableEnded) {
      this.child.stdin.write("ROLLBACK;\n\\q\n", error => {
        if (error) this.abort("psql input stream closed",
          this.child.exitCode, this.child.signalCode);
      });
    }
    setTimeout(() => {
      if (!this.closed && this.child.exitCode === null) this.child.kill();
    }, 1200).unref();
  }
}
function jobLine(job, line) { job.lines.push(line.trim()); }

// Never print arbitrary PostgreSQL stderr or error arguments. Connection errors
// may echo credentials, while statement messages may contain member fields.
// Preserve safe SQLSTATE and fixed-category diagnostics only.
function categorizeFailure(stderr, exitCode, signal) {
  const data = String(stderr || "");
  const sqlstate = /(?:ERROR|FATAL):\s*([0-9A-Z]{5})(?:\s|$)/m.exec(data);
  if (sqlstate) return "SQLSTATE " + sqlstate[1] + " (inspect the named stage)";
  if (/password authentication failed|invalid password/i.test(data))
    return "database authentication failed: verify TEST database password";
  if (/could not translate host name|name or service not known|no such host/i.test(data))
    return "DNS resolution failed for the TEST database host";
  if (/network is unreachable|no route to host|address family not supported|cannot assign requested address/i.test(data))
    return "network unreachable (direct Supabase may require IPv6)";
  if (/connection timed out|operation timed out|timeout expired/i.test(data))
    return "connection timed out (check IPv6 support or firewall)";
  if (/connection refused|server closed the connection|could not connect to server/i.test(data))
    return "server refused or interrupted the connection";
  if (/certificate|SSL error|TLS error|SSL SYSCALL/i.test(data))
    return "TLS certificate/negotiation error";
  if (exitCode === 3) return "PostgreSQL SQL statement error (details deliberately redacted)";
  if (exitCode === 2) return "PostgreSQL connection interrupted";
  if (exitCode === 1) return "psql failed to connect or exited abnormally";
  return "exit=" + (Number.isInteger(exitCode) ? exitCode : "unknown") +
    (signal ? " signal=" + String(signal).replace(/[^A-Z0-9]/g, "") : "");
}

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
    console.log("PASS: two distinct PostgreSQL backend sessions connected");
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
    console.log("CHECK: candidate function installed transaction-locally in session B");

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
    console.log("CHECK: session A holds an uncommitted staging grant revocation");

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
    console.log("CHECK: candidate function blocked on the administrator grant lock");
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
    console.log("LIMIT: authenticated HTTP/JWT races still require separate QA");
    if (process.argv.includes("--committed-probe")) {
      // The durable revocation is performed ONLY on a disposable shadow grant
      // table. Never toggle an actual staging administrator or auth user.
      // The function body is identical to the candidate except the single
      // grant table identifier. No production/real admin grant is changed.
      const probeTable = "registry_private.pr55_admin_probe_" + suffix;
      const probeActor = randomBytes(16).toString("hex").replace(
        /^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5");
      const grantSource = "registry_private.registration_administrators";
      const occurrences = functionDefinition.split(grantSource).length - 1;
      assert.equal(occurrences, 1, "Candidate grant table must occur exactly once");
      const candidateWithShadowGrant = functionDefinition.replace(
        grantSource, probeTable);
      let probeCreated = false;
      let probeBOpen = false;
      let probeAOpen = false;
      try {
        await a.command([
          "BEGIN;",
          "CREATE TABLE " + probeTable + " (user_id uuid PRIMARY KEY,",
          " active boolean NOT NULL, revoked_at timestamptz);",
          "INSERT INTO " + probeTable + "(user_id,active,revoked_at)",
          " VALUES (" + quote(probeActor) + "::uuid,true,NULL);",
          "COMMIT;"
        ].join("\n"), "PROBE_TABLE_CREATED");
        probeCreated = true;
        await b.command([
          "BEGIN;",
          "SET LOCAL statement_timeout='12000ms';",
          candidateWithShadowGrant,
          "SELECT set_config('request.jwt.claim.sub'," +
            quote(probeActor) + ",true);"
        ].join("\n"), "COMMIT_CANDIDATE_READY");
        probeBOpen = true;
        await a.command([
          "BEGIN;",
          "DO $hold$ DECLARE n integer; BEGIN",
          " UPDATE " + probeTable + " SET active=false,",
          " revoked_at=clock_timestamp()",
          " WHERE user_id=" + quote(probeActor) + "::uuid AND active;",
          " GET DIAGNOSTICS n = ROW_COUNT;",
          " IF n <> 1 THEN RAISE EXCEPTION 'Shadow grant revoke mismatch'; END IF;",
          "END $hold$;"
        ].join("\n"), "PROBE_REVOCATION_HELD");
        probeAOpen = true;

        // Catch rejection immediately to avoid an unhandled Promise rejection
        // while A is checking the actual PostgreSQL wait edge.
        const attempt = b.command([
          "DO $probe$",
          "DECLARE denied boolean := false;",
          "BEGIN",
          " BEGIN",
          "  PERFORM public.registration_intake_v1(gen_random_uuid(),",
          "    " + quote("PR55COMMIT" + suffix) + "," + quote("Denied") +
            "," + quote("Isolated PR55 Test") + ",",
          "    ARRAY['Mother Butler Guild'],2026);",
          " EXCEPTION WHEN insufficient_privilege THEN denied := true; END;",
          " IF NOT denied THEN",
          "  RAISE EXCEPTION 'Committed revocation failed to deny intake';",
          " END IF;",
          "END $probe$;"
        ].join("\n"), "COMMITTED_REVOKE_DENIED").then(
          lines => ({lines}), error => ({error}));

        // The B backend must actually be waiting on A's grant-row lock.
        // Poll through the independent A connection; no sleeps in the B
        // backend that could accidentally simulate the blocking condition.
        let observedWaiting = false;
        const bPid = Number(getPid(pidBLines));
        for (let attemptNumber = 0; attemptNumber < 8; attemptNumber++) {
          const lines = await a.command(
            "SELECT cardinality(pg_catalog.pg_blocking_pids(" + bPid +
            "))::integer; SELECT pg_sleep(0.12);",
            "PROBE_LOCK_WAIT_" + attemptNumber);
          if (lines.some(x => /^\d+$/.test(x) && Number(x) >= 1)) {
            observedWaiting = true;
            break;
          }
        }
        assert.ok(observedWaiting,
          "Could not independently observe candidate blocked on grant lock");

        await a.command("COMMIT;", "PROBE_REVOCATION_COMMITTED");
        probeAOpen = false;
        const bResult = await attempt;
        if (bResult.error) throw bResult.error;
        await b.command("ROLLBACK;", "PROBE_B_ROLLBACK");
        probeBOpen = false;
        console.log("PASS: disposable staging grant revocation COMMITTED while candidate was waiting");
        console.log("PASS: candidate denied intake with SQLSTATE 42501 after committed revocation");
      } finally {
        if (probeAOpen) {
          try { await a.command("ROLLBACK;", "PROBE_EMERGENCY_A"); } catch {}
        }
        if (probeBOpen) {
          try { await b.command("ROLLBACK;", "PROBE_EMERGENCY_B"); } catch {}
        }
        // Only the disposable grant table is persisted, briefly. Ensure
        // cleanup also occurs on a failed assertion before printing PASS.
        if (probeCreated) {
          try {
            await a.command("DROP TABLE IF EXISTS " + probeTable + ";",
              "PROBE_TABLE_DROPPED");
            console.log("CHECK: disposable committed-revocation table removed");
          } catch (dropError) {
            throw new Error("Staging disposable grant cleanup failed; inspect " +
              "registry_private tables before rerunning. " + dropError.message);
          }
        }
      }
    }
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
