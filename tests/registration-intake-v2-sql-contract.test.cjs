/**
 * Offline STATIC contract checks only. These tests DO NOT execute SQL, access
 * Supabase, prove PostgreSQL syntax, or establish JWT/concurrency guarantees.
 * Later isolated TEST-database integration requires separate approval.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "docs/sql/registration-intake-v2.REVIEW-ONLY.sql"), "utf8"
);
const filename = path.join(root, "lib/registration-csv-source-key.ts");
const transpiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(transpiled, filename);
const { csvRegistrationSourceKey: sourceKey, csvRegistrationGroupSourceKey: groupKey } = loaded.exports;
const hex = "ABCDEF0123456789".repeat(4);
const expected = "sha256:" + hex.toLowerCase() + ":row:2";

test("CSV source key is deterministic, case-normalized and PII-free", () => {
  assert.equal(sourceKey(hex, 2), expected);
  assert.equal(sourceKey(hex.toLowerCase(), 2), expected);
  assert.doesNotMatch(expected, /maria|santos|parish/i);
});
test("CSV source key separates different files and source rows", () => {
  assert.notEqual(sourceKey(hex, 2), sourceKey(hex, 3));
  assert.notEqual(sourceKey(hex, 2), sourceKey("f".repeat(64), 2));
});
test("CSV grouped identities always use first physical source row", () => {
  assert.equal(groupKey(hex, [7, 2, 4]), expected);
  assert.equal(groupKey(hex, [4, 7, 2]), expected);
});
test("CSV helper rejects bogus hashes, indexes and empty groups", () => {
  assert.throws(() => sourceKey("x", 2), /SHA-256/);
  assert.throws(() => sourceKey(hex, 1), /physical CSV/);
  assert.throws(() => sourceKey(hex, 1.5), /physical CSV/);
  assert.throws(() => groupKey(hex, []), /must contain/);
  assert.throws(() => groupKey(hex, [2, -1]), /Invalid CSV/);
});
test("review-only SQL cannot be executed unchanged", () => {
  const stopper = sql.indexOf("RAISE EXCEPTION 'REVIEW ONLY: registration_intake_v2");
  const firstDdl = sql.indexOf("ALTER TABLE");
  assert.ok(stopper > 0 && firstDdl > stopper, "a hard fail guard precedes all schema changes");
  assert.match(sql, /^BEGIN;/m);
});
test("SQL creates a new v2 function without replacing v1 or legacy writes", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.registration_intake_v2\s*\(/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION (?:public\.)?(?:registration_intake_v1|registry_admin_member_write_v1)\s*\(/);
  assert.match(sql, /RETURNS jsonb\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
});
test("SQL validates JWT administrator authorization before reading request replay", () => {
  const auth = sql.indexOf("registration_administrators AS a");
  const lock = sql.indexOf("pg_advisory_xact_lock(");
  const replay = sql.indexOf("SELECT * INTO v_prior");
  assert.ok(auth > 0 && auth < lock && lock < replay);
  assert.match(sql, /a\.active = true/);
  assert.match(sql, /a\.revoked_at IS NULL/);
  assert.match(sql, /USING ERRCODE = '42501'/);
});
test("SQL shares serialization key with existing v1", () => {
  assert.match(sql, /hashtextextended\('registry_registration_intake_v1', 0\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
});
test("SQL ledger fingerprints the full normalized identity and sources", () => {
  for (const field of ["'first'","'last'","'parish'","'ministries'","'year'","'notes'","'source'","'sourceKey'"]) {
    assert.ok(sql.includes(field), "missing fingerprint input " + field);
  }
  assert.match(sql, /v_prior\.actor_id IS DISTINCT FROM v_actor/);
  assert.match(sql, /v_prior\.fingerprint IS DISTINCT FROM v_fingerprint/);
  assert.match(sql, /Conflicting idempotency key/);
});
test("CSV table constraint explicitly rejects NULL, matching the function contract", () => {
  assert.match(sql, /source = 'csv' AND source_key IS NOT NULL\s+AND source_key ~/);
  assert.match(sql, /v_source_key IS NULL OR/);
});
test("SQL source-key regex excludes header row and matches the helper's bounds", () => {
  const schema = sql.match(/AND source_key ~ '([^']+)'/);
  const functionGuard = sql.match(/v_source_key !~ '([^']+)'/);
  assert.ok(schema && functionGuard, "both database validation points must exist");
  assert.equal(schema[1], functionGuard[1], "table and RPC patterns must agree");
  const pattern = new RegExp(schema[1]);
  const digest = "a".repeat(64);
  assert.equal(pattern.test(`sha256:${digest}:row:1`), false, "row 1 is a header");
  assert.equal(pattern.test(`sha256:${digest}:row:2`), true);
  assert.equal(pattern.test(`sha256:${digest}:row:999999999`), true);
  assert.equal(pattern.test(`sha256:${digest}:row:1000000000`), false);
  assert.equal(pattern.test(`sha256:${digest.toUpperCase()}:row:2`), false, "hex must be lowercase");
});

test("SQL rejects CSV source duplication under a changed UUID", () => {
  assert.match(sql, /CREATE UNIQUE INDEX registration_intake_request_csv_source_v2_uidx/);
  assert.match(sql, /ON registry_private\.registration_intake_requests\(actor_id, source_key\)/);
  assert.match(sql, /r\.actor_id = v_actor/);
  assert.match(sql, /r\.source_key = v_source_key/);
  assert.match(sql, /CSV source already processed/);
});
test("SQL makes all candidate matches reviewable rather than silently choosing one", () => {
  assert.match(sql, /WITH candidates AS MATERIALIZED/);
  assert.match(sql, /SELECT count\(\*\)::integer FROM candidates/);
  assert.match(sql, /ORDER BY created_at, id LIMIT 20/);
  assert.match(sql, /candidate_member_ids, candidate_count/);
  assert.match(sql, /v_candidate_count > cardinality\(v_candidate_ids\)/);
});
test("SQL leaves existing review storage and audit schema intact", () => {
  assert.match(sql, /ALTER TABLE registry_private\.registration_intake_reviews/);
  assert.match(sql, /INSERT INTO registry_private\.registration_intake_reviews/);
  assert.match(sql, /submitted_notes/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE TABLE/);
});
test("SQL writes notes, UID and all ministry assignments in one function", () => {
  assert.match(sql, /INSERT INTO public\.members/);
  assert.match(sql, /uid, notes/);
  assert.match(sql, /v_notes/);
  assert.match(sql, /SELECT uid INTO v_uid FROM public\.members/);
  assert.match(sql, /v_uid = 'PENDING'/);
  assert.match(sql, /INSERT INTO public\.member_ministries/);
  assert.match(sql, /'Pending Verification'/);
  assert.match(sql, /INSERT INTO registry_private\.registration_intake_requests/);
});
test("SQL response contract includes created, review, replay and generated UID", () => {
  assert.match(sql, /'status', 'created', 'memberId', v_member_id, 'uid', v_uid/);
  assert.match(sql, /'status', 'replayed', 'outcome', 'created'/);
  assert.match(sql, /'status', 'replayed', 'outcome', 'review'/);
  assert.match(sql, /'status', 'review', 'reviewId', v_review_id/);
});
test("SQL grants only authenticated RPC execute, never browser table writes", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.registration_intake_v2/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.registration_intake_v2/);
  assert.match(sql, /TO authenticated/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE) ON (?:public\.members|registry_private\.)/);
});
test("SQL explicitly preserves the legacy-write release blocker", () => {
  assert.match(sql, /legacy registry_admin_member_write_v1/);
  assert.match(sql, /RELEASE BLOCKER/);
  assert.doesNotMatch(sql, /DROP FUNCTION public\.registration_intake_v1/);
});
