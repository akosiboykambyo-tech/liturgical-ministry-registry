/**
 * Staging-only real JWT rehearsal of PR55 candidate logic.
 * Installs temporary *separately named* RPCs on isolated staging, tests
 * through genuine Supabase Auth + PostgREST, and drops RPCs in finally.
 * Valid registration is wrapped in an exception subtransaction that rolls
 * back all member, ministry, request, audit and review writes.
 * Never touches production or the existing registration_intake_v1 RPC.
 */
"use strict";
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const {randomUUID,randomBytes}=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
// Windows operator machine uses PostgreSQL 18. PATH is a fallback only.
// Node's spawnSync can return status:null + error.code:"ENOENT" when
// executable lookup fails, which is NOT a database/network timeout.
const KNOWN_WINDOWS_PSQL="C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";
const PSQL_BIN=process.platform==="win32"&&fs.existsSync(KNOWN_WINDOWS_PSQL)
  ? KNOWN_WINDOWS_PSQL : "psql";
const allowedSpawnErrors=new Set(["ENOENT","EACCES","EPERM","ETIMEDOUT",
  "ENOMEM","EAGAIN","ENOBUFS","EIO"]);
function classifySpawnResult(result) {
  const code=result.error?.code;
  if(code==="ENOENT")return "psql executable not found; check PostgreSQL 18 bin installation or PATH";
  if(code==="EACCES"||code==="EPERM")return "OS blocked launching psql (permissions/security software)";
  if(code==="ETIMEDOUT")return "local psql process timed out";
  if(code&&allowedSpawnErrors.has(code))return "local psql process launch failed ("+code+")";
  if(result.signal)return "local psql was terminated by signal (name redacted)";
  if(code)return "local psql process failed (unclassified spawn error)";
  return null;
}
if(process.argv.includes("--check-psql")){
  // Purely local executable check. No credentials, DB URL, JWT or network.
  const check=spawnSync(PSQL_BIN,["--version"],{
    encoding:"utf8",timeout:5000,windowsHide:true,
    env:process.env
  });
  if(check.error||check.status!==0){
    console.error("FAIL: "+(classifySpawnResult(check)||
      "psql executable exited unsuccessfully")+"; no database connection attempted");
    process.exit(1);
  }
  console.log("PASS: local psql executable launches; no database connection or changes");
  process.exit(0);
}
const REF="rtptybxugjhvpfjvcvgw";
const DBUSER="postgres."+REF;
const ORIGIN="https://"+REF+".supabase.co";
const VALID_OPTIN="I_ACCEPT_ISOLATED_STAGING_TEMPORARY_RPCS";
const dbUrl=process.env.PR55_STAGING_DATABASE_URL||"";
const pubKey=process.env.PR55_STAGING_PUBLISHABLE_KEY||"";
const email=process.env.PR55_STAGING_AUTH_EMAIL||"";
const authPassword=process.env.PR55_STAGING_AUTH_PASSWORD||"";
const nonAdminEmail=process.env.PR55_STAGING_NONADMIN_AUTH_EMAIL||"";
const nonAdminPassword=process.env.PR55_STAGING_NONADMIN_AUTH_PASSWORD||"";
const hasNonAdmin=Boolean(nonAdminEmail||nonAdminPassword);
if(hasNonAdmin&&(!nonAdminEmail.includes("@")||!nonAdminPassword)){
  console.error("REFUSED: both staging non-admin Auth email and password are required.");
  process.exit(2);
}
const cleanup=process.argv.includes("--cleanup-only");
const connectionCheck=process.argv.includes("--connection-check");
if(process.env.PR55_ALLOW_CANDIDATE_HTTP_PROBE!==VALID_OPTIN){
  console.error("REFUSED: explicit isolated-staging temporary-RPC opt-in required.");
  process.exit(2);
}
let u;
try{u=new URL(dbUrl);}catch{
  console.error("REFUSED: missing staging PostgreSQL URL.");process.exit(2);
}
if(!["postgres:","postgresql:"].includes(u.protocol)||
   u.hostname!=="aws-0-ap-northeast-1.pooler.supabase.com"||
   u.port!=="5432"||u.pathname!=="/postgres"||u.username!==DBUSER||
   !u.password||u.searchParams.get("sslmode")!=="require"||
   [...u.searchParams.keys()].some(k=>k!=="sslmode")){
  console.error("REFUSED: connection is not exact staging TLS Session pooler.");
  process.exit(2);
}
let pgpass;
try{pgpass=decodeURIComponent(u.password);}catch{
  console.error("REFUSED: invalid staging password encoding.");process.exit(2);
}
if(!pgpass||(!cleanup&&!connectionCheck&&(!pubKey.startsWith("sb_publishable_")||
  !email.includes("@")||!authPassword))){
  console.error("REFUSED: staging credentials missing.");process.exit(2);
}
if(process.argv.includes("--validate-config")){
  console.log("PASS: isolated staging RPC rehearsal configuration accepted; no connection made");
  process.exit(0);
}
function psql(sql,step){
  const proc=spawnSync(PSQL_BIN,["-X","-w","-q","-A","-t","-v",
    "ON_ERROR_STOP=1","-v","VERBOSITY=sqlstate"],{
    input:sql,encoding:"utf8",timeout:45000,windowsHide:true,
    env:{
      PATH:process.env.Path||process.env.PATH||"",
      SystemRoot:process.env.SystemRoot||"",
      PGHOST:u.hostname,PGPORT:"5432",PGDATABASE:"postgres",
      PGUSER:DBUSER,PGPASSWORD:pgpass,PGSSLMODE:"require",
      PGCONNECT_TIMEOUT:"10",PGAPPNAME:"pr55_candidate_http_rehearsal"
    }
  });
  if(proc.status!==0){
    const err=String(proc.stderr||"");
    // Do not print raw stderr; it can expose connection strings or data.
    const match=/(?:ERROR|FATAL):\s*([0-9A-Z]{5})(?:\s|$)/m.exec(err);
    const reason=classifySpawnResult(proc)
      || (/password authentication failed/i.test(err)
        ? "staging database password rejected"
        : /could not translate host name|name or service not known/i.test(err)
        ? "staging pooler DNS resolution failed"
        : /connection timed out|timeout expired/i.test(err)
        ? "staging pooler connection timed out"
        : /connection refused|server closed the connection/i.test(err)
        ? "staging pooler refused or closed connection"
        : match ? "Postgres SQLSTATE "+match[1]
        : "psql exit "+(proc.status===null?"unknown":proc.status));
    throw new Error(step+": "+reason+"; details redacted");
  }
  return proc.stdout.trim();
}
if(connectionCheck){
  try{
    const status=psql("SELECT 1;","read-only staging pooler connection check");
    assert.equal(status,"1","unexpected read-only staging response");
    console.log("PASS: staging PostgreSQL Session pooler reached with supplied database credentials; NO writes made");
    process.exit(0);
  }catch(error){
    console.error("FAIL:",error.message||"read-only staging connection check failed");
    process.exit(1);
  }
}
const SIG="(uuid,text,text,text,text[],integer)";
const FUN="public.registration_pr55_http_candidate"+SIG;
const WRAP="public.registration_pr55_http_probe"+SIG;
const source=fs.readFileSync(path.join(__dirname,
  "../docs/sql/registration-staging-intake-function.ISOLATED-ONLY.sql"),"utf8");
const begin=source.indexOf("CREATE OR REPLACE FUNCTION public.registration_intake_v1(");
const marker=source.indexOf("AS $fn$",begin);
const end=source.indexOf("$fn$;",marker+7);
assert.ok(begin>=0&&marker>begin&&end>marker,"Candidate SQL source not recognized");
const candidate=source.slice(begin,end+5).replace(
  "CREATE OR REPLACE FUNCTION public.registration_intake_v1(",
  "CREATE FUNCTION public.registration_pr55_http_candidate(");
assert.match(candidate,/FOR SHARE/);
assert.equal((candidate.match(/registry_private\.registration_administrators/g)||[]).length,1);
const wrapper=[
  "CREATE FUNCTION public.registration_pr55_http_probe(",
  "p_request uuid,p_first text,p_last text,p_parish text,p_ministries text[],p_year integer)",
  "RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $probe$",
  "DECLARE first_result jsonb; replay_result jsonb;",
  "BEGIN",
  " BEGIN",
  "  first_result := public.registration_pr55_http_candidate(p_request,p_first,p_last,p_parish,p_ministries,p_year);",
  "  replay_result := public.registration_pr55_http_candidate(p_request,p_first,p_last,p_parish,p_ministries,p_year);",
  "  RAISE EXCEPTION 'PR55_ROLLBACK_SENTINEL' USING ERRCODE='P0001';",
  " EXCEPTION WHEN raise_exception THEN",
  "  IF SQLERRM <> 'PR55_ROLLBACK_SENTINEL' THEN RAISE; END IF;",
  " END;",
  " RETURN jsonb_build_object('firstStatus',first_result->>'status',",
  "  'replayStatus',replay_result->>'status','allWritesRolledBack',true);",
  "END;",
  "$probe$;"
].join("\n");
const drop=[
  "BEGIN;",
  "SET LOCAL lock_timeout='5s';",
  "DROP FUNCTION IF EXISTS "+WRAP+";",
  "DROP FUNCTION IF EXISTS "+FUN+";",
  "COMMIT;",
  "NOTIFY pgrst, 'reload schema';"
].join("\n");
function install(){
  const sql=[
    "BEGIN;",
    "SET LOCAL lock_timeout='5s';",
    "SET LOCAL statement_timeout='20000ms';",
    "DO $guard$ BEGIN",
    "IF current_user <> 'postgres' OR",
    " (SELECT count(*) FROM registry_private.registration_administrators WHERE active AND revoked_at IS NULL) <> 1",
    " THEN RAISE EXCEPTION 'Staging administrator preflight failed'; END IF;",
    "IF to_regprocedure('"+FUN+"') IS NOT NULL OR to_regprocedure('"+WRAP+"') IS NOT NULL",
    " THEN RAISE EXCEPTION 'Existing PR55 rehearsal RPC requires explicit cleanup'; END IF;",
    "END $guard$;",
    candidate,
    "REVOKE ALL ON FUNCTION "+FUN+" FROM PUBLIC,anon,authenticated;",
    wrapper,
    "REVOKE ALL ON FUNCTION "+WRAP+" FROM PUBLIC,anon,authenticated;",
    "GRANT EXECUTE ON FUNCTION "+WRAP+" TO authenticated;",
    "COMMIT;",
    "NOTIFY pgrst, 'reload schema';"
  ].join("\n");
  psql(sql,"install temporary isolated-staging RPCs");
}
async function http(route,options={}){
  const headers={apikey:pubKey,"Content-Type":"application/json"};
  if(options.jwt)headers.Authorization="Bearer "+options.jwt;
  const r=await fetch(ORIGIN+route,{
    method:options.method||"POST",headers,
    body:options.body===undefined?undefined:JSON.stringify(options.body),
    redirect:"error",signal:AbortSignal.timeout(15000)
  });
  let data=null;
  try{data=await r.json();}catch{}
  return {status:r.status,data};
}
function args(name){
  return {p_request:randomUUID(),p_first:name,p_last:"Probe",
    p_parish:"Isolated PR55 Rehearsal",p_ministries:["Mother Butler Guild"],p_year:2026};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  if(cleanup){
    psql(drop,"explicit cleanup");
    console.log("PASS: temporary staging PR55 HTTP rehearsal RPCs removed");
    return;
  }
  const name="PR55HTTP"+randomBytes(7).toString("hex");
  let installed=false;
  let installAttempted=false;
  try{
    const empty=psql(
      "SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
      "WHERE n.nspname='public' AND p.proname IN ('registration_pr55_http_candidate','registration_pr55_http_probe');",
      "read-only temporary RPC preflight");
    assert.equal(empty,"0",
      "stale temporary PR55 RPC exists; do not install or drop another session's functions");
    installAttempted=true;
    install();
    installed=true;
    console.log("CHECK: temporary candidate and rollback-only RPC wrapper installed");
    let anon;
    for(let attempt=0;attempt<6;attempt++){
      anon=await http("/rest/v1/rpc/registration_pr55_http_probe",{body:args(name)});
      if(anon.status!==404)break;
      await pause(800);
    }
    assert.equal(anon.status,401,"anonymous candidate wrapper must be denied");
    console.log("PASS: anonymous caller denied");
    const bad=await http("/rest/v1/rpc/registration_pr55_http_probe",{
      jwt:"not-a-jwt",body:args(name)});
    assert.equal(bad.status,401,"invalid JWT must be denied");
    console.log("PASS: invalid JWT denied");
    const auth=await http("/auth/v1/token?grant_type=password",{
      body:{email,password:authPassword}});
    assert.equal(auth.status,200,"staging Auth login failed; HTTP "+auth.status);
    const jwt=auth.data?.access_token;
    assert.ok(typeof jwt==="string"&&jwt.length>50,"staging JWT missing");
    const identity=await http("/auth/v1/user",{method:"GET",jwt});
    assert.equal(identity.status,200,"real staging JWT not validated");
    const admin=await http("/rest/v1/rpc/registration_is_admin",{jwt});
    assert.equal(admin.status,200,"admin check HTTP failure");
    assert.equal(admin.data,true,"staging Auth user not approved administrator");
    console.log("PASS: real staging Auth JWT and administrator permission");
    if(hasNonAdmin){
      const login=await http("/auth/v1/token?grant_type=password",{
        body:{email:nonAdminEmail,password:nonAdminPassword}});
      assert.equal(login.status,200,
        "non-admin staging Auth login failed; HTTP "+login.status);
      const unprivilegedJwt=login.data?.access_token;
      assert.ok(typeof unprivilegedJwt==="string"&&unprivilegedJwt.length>50,
        "missing non-admin staging Auth JWT");
      const id=await http("/auth/v1/user",{
        method:"GET",jwt:unprivilegedJwt});
      assert.equal(id.status,200,"non-admin staging Auth JWT was not verified");
      assert.notEqual(id.data?.id,identity.data?.id,
        "non-admin token belongs to the same staging administrator");
      const grant=await http("/rest/v1/rpc/registration_is_admin",{
        jwt:unprivilegedJwt});
      assert.equal(grant.status,200,"non-admin status HTTP request failed");
      assert.equal(grant.data,false,
        "staging non-admin unexpectedly has registration administrator access");
      const denied=await http("/rest/v1/rpc/registration_pr55_http_probe",{
        jwt:unprivilegedJwt,body:args(name)});
      assert.equal(denied.status,403,
        "non-admin candidate registration must fail; HTTP "+denied.status);
      assert.equal(denied.data?.code,"42501",
        "non-admin must be denied by candidate's DB grant authorization check");
      console.log("PASS: real second staging Auth JWT denied by latest candidate (SQLSTATE 42501)");
    } else {
      console.log("LIMIT: no independent staging non-admin Auth JWT supplied or tested");
    }
    // PostgREST needs time to reload schema after temporary RPC creation.
    let invalid;
    for(let attempt=0;attempt<5;attempt++){
      invalid=await http("/rest/v1/rpc/registration_pr55_http_probe",{
        jwt,body:{p_request:randomUUID(),p_first:"",p_last:"",
          p_parish:"",p_ministries:[],p_year:2026}});
      if(invalid.status!==404)break;
      await pause(800);
    }
    assert.equal(invalid.status,400,"invalid candidate request HTTP "+invalid.status);
    assert.equal(invalid.data?.code,"22023","expected candidate validation SQLSTATE 22023");
    console.log("PASS: candidate rejected invalid authenticated registration");
    const direct=await http("/rest/v1/rpc/registration_pr55_http_candidate",{
      jwt,body:args(name)});
    assert.ok([403,404].includes(direct.status),
      "underlying candidate must not be directly executable");
    console.log("PASS: candidate direct RPC access denied to authenticated");
    const valid=await http("/rest/v1/rpc/registration_pr55_http_probe",{
      jwt,body:args(name)});
    assert.equal(valid.status,200,"rollback wrapper valid HTTP request failed; HTTP "+valid.status);
    assert.equal(valid.data?.firstStatus,"created","candidate create outcome mismatch");
    assert.equal(valid.data?.replayStatus,"replayed","candidate idempotent replay mismatch");
    assert.equal(valid.data?.allWritesRolledBack,true,"mandatory rollback missing");
    console.log("PASS: candidate created/replayed via real authenticated HTTP under forced rollback");
    const persisted=psql("SELECT count(*) FROM public.members WHERE first_name='"+name+"';",
      "independent rollback check");
    assert.equal(persisted,"0","synthetic candidate registration persisted");
    console.log("PASS: candidate HTTP rehearsal left no member data");
  }finally{
    if(installAttempted){
      try{
        psql(drop,"cleanup temporary RPCs after installation attempt");
        console.log("CHECK: temporary candidate RPCs removed");
      }catch{
        process.exitCode=1;
        console.error("ALERT: temp RPC cleanup failed; rerun this script --cleanup-only with staging DB credentials");
      }
    }
  }
}
main().catch(error=>{
  console.error("FAIL:",String(error.message||"candidate staging rehearsal failed")
    .replace(/sb_publishable_[^\s]+/g,"[REDACTED]"));
  process.exitCode=1;
});
