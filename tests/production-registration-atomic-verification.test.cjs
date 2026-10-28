const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sql = fs.readFileSync(path.join(__dirname, "../docs/sql/pr55-atomic-verification-and-validity.REVIEW-ONLY.sql"),"utf8");

test("SQL is inert until separate release approval", () => {
  assert.match(sql,/RAISE EXCEPTION 'PR55 NO-GO/);
  assert.ok(sql.indexOf("RAISE EXCEPTION 'PR55 NO-GO") < sql.indexOf("ALTER TABLE"));
});
test("authorization uses active private grant and blocks concurrent revocation", () => {
  const occurrences = sql.match(/registry_private\.registration_administrators/g) || [];
  assert.ok(occurrences.length >= 3);
  assert.match(sql,/a\.active = true AND a\.revoked_at IS NULL\s+FOR SHARE/g);
  assert.doesNotMatch(sql,/auth\.jwt\(\)\s*->>\s*'email'/);
});
test("exactly one calendar year is enforced at renewal write boundaries", () => {
  assert.match(sql,/recommendation_renewal_batches_exact_year_pr55/);
  assert.match(sql,/member_ministries_renewed_exact_year_pr55/);
  assert.match(sql,/next_renewal_date = \(renewal_date \+ INTERVAL '1 year'\)::date/);
  assert.match(sql,/expiration_date = \(renewal_date \+ INTERVAL '1 year'\)::date/);
});
test("atomic verification selects and locks explicitly authorized assignment IDs", () => {
  assert.match(sql,/registry_verify_ministries_v1\(/);
  assert.match(sql,/array_agg\(DISTINCT id ORDER BY id\)/);
  assert.match(sql,/PERFORM 1 FROM public\.members WHERE id = p_member_id FOR UPDATE/);
  assert.match(sql,/mm\.member_id = p_member_id AND mm\.id = ANY\(v_ids\)/);
  assert.match(sql,/GET DIAGNOSTICS v_locked = ROW_COUNT/);
  assert.match(sql,/v_locked <> v_expected/);
});
test("server computes the verification date and expiry without client-supplied dates", () => {
  assert.match(sql,/AT TIME ZONE 'Asia\/Manila'/);
  assert.match(sql,/v_expires := \(v_today \+ INTERVAL '1 year'\)::date/);
  const signature = sql.match(/CREATE OR REPLACE FUNCTION public\.registry_verify_ministries_v1\(([\s\S]*?)\) RETURNS jsonb/);
  assert.ok(signature);
  assert.doesNotMatch(signature[1], /p_expiration_date|p_verified_at|p_renewal_date/);
});
test("pending ministries do not auto-verify when another ministry is approved", () => {
  assert.match(sql,/WHEN v_pending > 0 THEN 'Pending Verification'/);
  assert.match(sql,/WHERE mm\.member_id = p_member_id AND mm\.id = ANY\(v_ids\)/);
});
test("unapproved direct function calls are denied by privilege revocation", () => {
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.registry_verify_ministries_v1\(uuid,uuid\[\],text\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.check_renewal_admin_access\(\)\s+FROM PUBLIC, anon, authenticated/);
});
test("a renewal requires an existing verified assignment and uploaded letter", () => {
  assert.match(sql,/mm\.status NOT IN \('New','Renewed'\) OR mm\.document_url IS NULL/);
});
