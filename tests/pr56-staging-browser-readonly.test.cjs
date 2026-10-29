const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const script=path.join(__dirname,"../scripts/pr56-staging-browser-readonly.cjs");
const src=fs.readFileSync(script,"utf8");
test("browser smoke refuses by default",()=>{
 const r=spawnSync(process.execPath,[script,"--run"],{
  env:{PATH:process.env.PATH||""},encoding:"utf8",timeout:6000
 });
 assert.equal(r.status,2);
 assert.match(r.stderr,/REFUSED/);
});
test("configuration checks do not need playwright or send requests",()=>{
 const r=spawnSync(process.execPath,[script,"--validate-config"],{
  env:{
   PATH:process.env.PATH||"",
   PR56_ALLOW_STAGING_BROWSER_SMOKE:"I_ACCEPT_READONLY_STAGING_BROWSER_SMOKE",
   PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_not_real",
   PR55_STAGING_AUTH_EMAIL:"staging-admin@example.invalid",
   PR55_STAGING_AUTH_PASSWORD:"synthetic-not-real"
  },encoding:"utf8",timeout:6000
 });
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/NO network or database requests made/);
});
test("browser smoke is pinned to staging and cannot use server service-key workflows",()=>{
 assert.match(src,/rtptybxugjhvpfjvcvgw/);
 assert.doesNotMatch(src,/zlvofcwnpdzfdnipvbbd/);
 assert.match(src,/NEXT_PUBLIC_SUPABASE_URL:STAGING_URL/);
 assert.match(src,/NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION:"enabled"/);
 assert.match(src,/SUPABASE_SERVICE_ROLE_KEY:""/);
 assert.match(src,/ADMIN_LOCKOUT_HMAC_SECRET:""/);
 assert.match(src,/127\.0\.0\.1:3197/);
});
test("browser smoke uses real Auth and protected UI without any write actions",()=>{
 assert.match(src,/auth\.signInWithPassword/);
 assert.match(src,/addInitScript/);
 assert.match(src,/Verify Ministry Assignments/);
 assert.match(src,/Review ministries/);
 assert.match(src,/isChecked\(\)/);
 assert.match(src,/isDisabled\(\)/);
 assert.match(src,/afterMembers,beforeMembers/);
 assert.doesNotMatch(src,/\.rpc\(|\.upload\(|\.update\(|\.insert\(|\.delete\(/);
});
