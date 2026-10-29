const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const repo=path.join(__dirname,"..");
const script=fs.readFileSync(path.join(repo,"scripts/pr55-staging-positive-verification-e2e.cjs"),"utf8");
const sql=fs.readFileSync(path.join(repo,"docs/sql/pr55-staging-positive-e2e-fixture.INSTALL-ISOLATED-ONLY.sql"),"utf8");
const file=path.join(repo,"scripts/pr55-staging-positive-verification-e2e.cjs");
const safeEnv={
 PATH:process.env.PATH||"",
 PR55_ALLOW_POSITIVE_E2E:"I_ACCEPT_STAGING_SYNTHETIC_WRITES_WITH_CLEANUP",
 PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_not_real",
 PR55_STAGING_AUTH_EMAIL:"admin@example.invalid",
 PR55_STAGING_AUTH_PASSWORD:"synthetic-not-real",
 PR55_STAGING_NONADMIN_AUTH_EMAIL:"other@example.invalid",
 PR55_STAGING_NONADMIN_AUTH_PASSWORD:"synthetic-not-real"
};
test("positive E2E refuses by default, without contacting staging",()=>{
 const r=spawnSync(process.execPath,[file,"--run"],{
  encoding:"utf8",timeout:5000,env:{PATH:process.env.PATH||""}
 });
 assert.equal(r.status,2);
 assert.match(r.stderr,/REFUSED/);
});
test("positive E2E validate-config is safe and cannot write",()=>{
 const r=spawnSync(process.execPath,[file,"--validate-config"],{
  encoding:"utf8",timeout:5000,env:safeEnv
 });
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/NO requests or writes made/);
});
test("test is permanently pinned to isolated staging and uses synthetic fixtures",()=>{
 assert.match(script,/rtptybxugjhvpfjvcvgw\.supabase\.co/);
 assert.doesNotMatch(script,/zlvofcwnpdzfdnipvbbd/);
 assert.match(sql,/to_regclass\('public\.recommendation_renewal_batches'\) IS NOT NULL/);
 assert.match(sql,/PR55E2E-/);
 assert.match(sql,/synthetic assignment inventory changed/);
});
test("fixture actions require an active revocable admin grant and restrict cleanup",()=>{
 assert.match(sql,/CREATE FUNCTION public\.pr55_e2e_begin_v1/);
 assert.match(sql,/CREATE FUNCTION public\.pr55_e2e_finish_v1/);
 assert.ok((sql.match(/a\.active AND a\.revoked_at IS NULL FOR SHARE/g)||[]).length===2);
 assert.match(sql,/DELETE FROM public\.member_ministries WHERE member_id=p_member_id/);
 assert.match(sql,/notes='PR55E2E test-only nonce: '/);
 assert.match(sql,/first_name='PR55E2E'/);
 assert.doesNotMatch(sql,/uid=v_expected/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.pr55_e2e_begin_v1\(uuid\)/);
});
test("real HTTP test uploads synthetic PDF, attaches, verifies and tests RLS",()=>{
 assert.match(script,/signInWithPassword/);
 assert.match(script,/pdfFixture\(\)/);
 assert.match(script,/\.storage\.from\("member-documents"\)/);
 assert.match(script,/registry_attach_ministry_letter_v1/);
 assert.match(script,/registry_verify_ministries_v1/);
 assert.match(script,/p_membership_ids:\[fixture\.first_id\]/);
 assert.match(script,/untouched\.status,"Pending Verification"/);
 assert.match(script,/member\.data\.status,"Pending Verification"/);
 assert.match(script,/nonadmin\.from\("member_ministries"\)/);
});
test("script always attempts both database and Storage cleanup",()=>{
 assert.match(script,/finally\s*\{/);
 assert.match(script,/pr55_e2e_finish_v1/);
 assert.match(script,/\.remove\(\[storagePath\]\)/);
 assert.match(script,/CLEANUP REQUIRED/);
});
