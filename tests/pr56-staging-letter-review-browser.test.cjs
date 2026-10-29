const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const scriptPath=path.join(__dirname,"../scripts/pr56-staging-letter-review-browser.cjs");
const sqlPath=path.join(__dirname,"../docs/sql/pr56-staging-letter-review-fixture.INSTALL-ISOLATED-ONLY.sql");
const runner=fs.readFileSync(scriptPath,"utf8"),sql=fs.readFileSync(sqlPath,"utf8");
test("letter-review browser rejects execution without explicit opt-in",()=>{
 const result=spawnSync(process.execPath,[scriptPath,"--run"],{
  encoding:"utf8",timeout:6000,env:{PATH:process.env.PATH||""}
 });
 assert.equal(result.status,2);
 assert.match(result.stderr,/REFUSED/);
});
test("validating configuration never sends requests or creates synthetic users",()=>{
 const result=spawnSync(process.execPath,[scriptPath,"--validate-config"],{
  encoding:"utf8",timeout:6000,env:{
   PATH:process.env.PATH||"",
   PR56_ALLOW_LETTER_BROWSER_E2E:"I_ACCEPT_STAGING_SYNTHETIC_LETTER_BROWSER_TEST",
   PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_not_real",
   PR55_STAGING_AUTH_EMAIL:"example@example.invalid",
   PR55_STAGING_AUTH_PASSWORD:"not-a-secret"
  }
 });
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/NO requests or writes made/);
});
test("isolation and cleanup guard prohibit accidental production writes",()=>{
 assert.match(runner,/rtptybxugjhvpfjvcvgw/);
 assert.doesNotMatch(runner,/zlvofcwnpdzfdnipvbbd/);
 assert.match(runner,/NEXT_PUBLIC_SUPABASE_URL:SUPABASE_URL/);
 assert.match(runner,/SUPABASE_SERVICE_ROLE_KEY:""/);
 assert.match(sql,/to_regclass\('public\.recommendation_renewal_batches'\) IS NOT NULL/);
 assert.match(sql,/count\(\*\) FROM public\.members\) <> 1008/);
 assert.match(sql,/PR56REVIEW test-only nonce/);
 assert.match(sql,/a\.active AND a\.revoked_at IS NULL FOR SHARE/g);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.pr56_review_begin_v1/);
});
test("real browser test checks signed PDF, disabled approvals, and never submits verification",()=>{
 assert.match(runner,/signInWithPassword/);
 assert.match(runner,/\.upload\(pdfPath,fakePdf\(\)/);
 assert.match(runner,/registry_attach_ministry_letter_v1/);
 assert.match(runner,/Prepare secure letter link/);
 assert.match(runner,/Open recommendation letter \(new tab\)/);
 assert.match(runner,/context\.request\.get\(signedHref/);
 assert.match(runner,/pdfBody\.subarray\(0,5\)\.toString\(\)!=="%PDF-"/);
 assert.match(runner,/selectedToggle\.check\(\)/);
 assert.match(runner,/Verify 1 selected/);
 assert.doesNotMatch(runner,/registry_verify_ministries_v1/);
 assert.match(runner,/Browser smoke unexpectedly changed a ministry assignment/);
});
test("recovery requires exact test-only identity and Storage path before cleanup",()=>{
 assert.match(runner,/async function recover\(\)/);
 assert.match(runner,/Cleanup refuses ambiguous\/missing synthetic member/);
 assert.match(runner,/first\.status!=="Pending Verification"/);
 assert.match(runner,/second\.status!=="Pending Verification"/);
 assert.match(runner,/listing\.data\.length!==1/);
 assert.match(runner,/pr56_review_finish_v1/);
 assert.match(runner,/\.remove\(\[pdfPath\]\)/);
 assert.match(runner,/CLEANUP REQUIRED/);
 assert.match(runner,/finally\s*\{/);
});
