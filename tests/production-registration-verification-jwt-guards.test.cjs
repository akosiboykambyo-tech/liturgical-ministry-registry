const { test }=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const { spawnSync }=require("node:child_process");
const script=path.join(__dirname,"../scripts/pr55-staging-verify-rpc-jwt.cjs");
const source=fs.readFileSync(script,"utf8");
function run(envArgs,args=["--run"]) {
  return spawnSync(process.execPath,[script,...args],{
    encoding:"utf8", timeout:5000, env:{PATH:process.env.PATH||"",...envArgs}
  });
}
test("refuses absent explicit staging consent",()=>{
  const r=run({});assert.equal(r.status,2);assert.match(r.stderr,/REFUSED/);
});
test("refuses missing staging credential variables without network call",()=>{
  const r=run({PR55_ALLOW_VERIFY_JWT_PROBE:"I_ACCEPT_READONLY_STAGING_AUTH_TESTS"});
  assert.equal(r.status,2);assert.match(r.stderr,/REFUSED/);
});
test("refuses same admin and nonadmin Auth identities",()=>{
  const env={
    PR55_ALLOW_VERIFY_JWT_PROBE:"I_ACCEPT_READONLY_STAGING_AUTH_TESTS",
    PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_do_not_use",
    PR55_STAGING_AUTH_EMAIL:"synthetic@example.invalid",
    PR55_STAGING_AUTH_PASSWORD:"synthetic-dummy",
    PR55_STAGING_NONADMIN_AUTH_EMAIL:"SYNTHETIC@example.invalid",
    PR55_STAGING_NONADMIN_AUTH_PASSWORD:"synthetic-dummy"
  };
  const r=run(env,["--validate-config"]);assert.equal(r.status,2);
});
test("valid staging config check makes zero HTTP requests",()=>{
  const env={
    PR55_ALLOW_VERIFY_JWT_PROBE:"I_ACCEPT_READONLY_STAGING_AUTH_TESTS",
    PR55_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_do_not_use",
    PR55_STAGING_AUTH_EMAIL:"synthetic-admin@example.invalid",
    PR55_STAGING_AUTH_PASSWORD:"synthetic-dummy",
    PR55_STAGING_NONADMIN_AUTH_EMAIL:"synthetic-other@example.invalid",
    PR55_STAGING_NONADMIN_AUTH_PASSWORD:"synthetic-dummy"
  };
  const r=run(env,["--validate-config"]);assert.equal(r.status,0);
  assert.match(r.stdout,/NO requests made/);
});
test("HTTP probe is pinned to isolated staging and validates both roles",()=>{
  assert.match(source,/rtptybxugjhvpfjvcvgw\.supabase\.co/);
  assert.doesNotMatch(source,/zlvofcwnpdzfdnipvbbd/);
  assert.match(source,/ungranted authenticated caller/);
  assert.match(source,/anonymous EXECUTE/);
  assert.match(source,/granted administrator invalid request/);
  assert.match(source,/NO registry writes requested/);
  assert.doesNotMatch(source,/\.from\("members"\)\.insert|DELETE FROM|UPDATE public\.members/);
});
