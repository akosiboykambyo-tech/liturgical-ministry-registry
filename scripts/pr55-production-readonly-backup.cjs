/**
 * Production DB READ-ONLY logical export for Free-tier PR55 recovery gate.
 * Uses exact project/region; never modifies production or accesses staging.
 * Export includes confidential member and auth records: encrypt/archive securely.
 */
"use strict";
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {randomBytes,createHash}=require("node:crypto");
const REF="zlvofcwnpdzfdnipvbbd";
// The cluster index is assigned by Supabase and cannot be inferred from region.
// User must copy the correct production Session pooler host from Connect.
// Restrict to Sydney shared pooler endpoints; username pins production project.
const HOST_PATTERN=/^aws-(?:0|[1-9][0-9]*)-ap-southeast-2\.pooler\.supabase\.com$/;
const USER="postgres."+REF;
const OPT_IN="I_ACCEPT_READONLY_PRODUCTION_LOGICAL_BACKUP";
const archiveDir=path.join(os.homedir(),"COWL-DOK-PRIVATE-BACKUPS");
function tool(name) {
  const win="C:\\Program Files\\PostgreSQL\\18\\bin\\"+name+".exe";
  return process.platform==="win32"&&fs.existsSync(win)?win:name;
}
const pgDump=tool("pg_dump");
const pgRestore=tool("pg_restore");
const psql=tool("psql");
function classifyBackupFailure(result) {
  if(result.error?.code==="ENOENT")return "local PostgreSQL client executable was not found";
  if(result.error?.code==="ETIMEDOUT")return "local PostgreSQL client exceeded its timeout";
  if(result.error?.code==="EACCES"||result.error?.code==="EPERM")
    return "local PostgreSQL client could not be launched due to OS permissions";
  if(result.error?.code)return "local PostgreSQL client launch failed ("+result.error.code+")";
  if(result.signal)return "PostgreSQL client was terminated before completion";
  const error=String(result.stderr||"");
  // Ordered by likely operator resolution; never reveal raw server stderr,
  // query text, database identifiers, password or connection URI.
  if(/password authentication failed|authentication failed/i.test(error))
    return "production database authentication rejected; verify PRODUCTION database password";
  if(/no pg_hba\.conf entry|SSL off|SSL is required/i.test(error))
    return "production network/TLS connection was rejected";
  if(/tenant.*not found|user.*not found|no such tenant/i.test(error))
    return "production Session pooler tenant/account rejected";
  if(/unsupported startup parameter|invalid.*startup parameter|unrecognized configuration parameter|invalid value for parameter/i.test(error))
    return "production pooler/database rejected a read-only startup parameter";
  if(/too many clients|too many connections|remaining connection slots|pool.*exhausted/i.test(error))
    return "production connection pool is exhausted";
  if(/could not translate host name|name or service not known|nodename nor servname/i.test(error))
    return "production pooler hostname could not be resolved";
  if(/connection timed out|timeout expired|server closed the connection|connection refused|could not connect to server/i.test(error))
    return "production pooler connection failed or timed out";
  if(/server version:|aborting because of server version mismatch|unsupported server version/i.test(error))
    return "PostgreSQL client/server version compatibility failed";
  if(/permission denied for.*large object|large object.*permission denied/i.test(error))
    return "export blocked by PostgreSQL large-object permissions (do not silently omit objects)";
  if(/row.level security policy|row level security|row security|bypassrls/i.test(error))
    return "export blocked by row-level security permissions";
  if(/permission denied for (table|schema|sequence|relation|view)|must be owner of/i.test(error))
    return "export blocked by database object privileges";
  if(/cannot execute.*read.only|read.only transaction/i.test(error))
    return "export operation conflicted with enforced read-only transaction; investigate before changing guard";
  if(/out of disk space|no space left on device|could not open output file|could not write to output file|permission denied.*\.partial/i.test(error))
    return "local backup file could not be created or written";
  if(/statement timeout|canceling statement due to/i.test(error))
    return "database statement was cancelled or timed out";
  const pgState=/(?:SQLSTATE|sqlstate)[\s:=]+([0-9A-Z]{5})/i.exec(error);
  if(pgState)return "database rejected export (SQLSTATE "+pgState[1]+")";
  return "pg_dump returned a nonzero status; safe category unknown (local diagnostic needed)";
}

function run(program,args,options={}) {
  const r=spawnSync(program,args,{
    encoding:"utf8",windowsHide:true,timeout:options.timeout||20000,
    env:options.env||process.env,maxBuffer:8*1024*1024
  });
  if(r.error||r.status!==0) {
    const reason=classifyBackupFailure(r);
    throw new Error((options.stage||"backup check")+": "+reason+"; details redacted");
  }
  return r.stdout||"";
}
if(process.argv.includes("--check-tools")) {
  try {
    const version=run(pgDump,["--version"],{stage:"pg_dump executable check"});
    run(pgRestore,["--version"],{stage:"pg_restore executable check"});
    if(!/pg_dump \(PostgreSQL\) (?:1[789]|2\d)\./.test(version))
      throw new Error("PostgreSQL 17+ pg_dump required for production Postgres 17");
    console.log("PASS: local PostgreSQL dump/restore tools available; no production connection made");
  } catch(e){console.error("FAIL:",e.message);process.exitCode=1;}
} else if(process.argv.includes("--backup")||process.argv.includes("--connection-check")) {
  (async()=>{
    if(process.env.PR55_ALLOW_PRODUCTION_BACKUP!==OPT_IN){
      console.error("REFUSED: explicit production read-only backup opt-in required");
      process.exitCode=2;return;
    }
    let url;
    try {url=new URL(process.env.PR55_PRODUCTION_DATABASE_URL||"");}
    catch{console.error("REFUSED: production database URL missing");process.exitCode=2;return;}
    if(!["postgres:","postgresql:"].includes(url.protocol)||
       !HOST_PATTERN.test(url.hostname)||url.port!=="5432"||url.pathname!=="/postgres"||
       url.username!==USER||!url.password||url.searchParams.get("sslmode")!=="require"||
       [...url.searchParams.keys()].some(x=>x!=="sslmode")){
      console.error("REFUSED: only exact production TLS Session pooler is allowed");
      process.exitCode=2;return;
    }
    let pw;
    try{pw=decodeURIComponent(url.password);}catch{
      console.error("REFUSED: malformed production DB password encoding");process.exitCode=2;return;
    }
    if(!pw){console.error("REFUSED: empty database password");process.exitCode=2;return;}
    console.log("CHECK: operator-supplied production Session pooler hostname matches Sydney allowlist");
    const env={
      PATH:process.env.Path||process.env.PATH||"",
      SystemRoot:process.env.SystemRoot||"",
      TEMP:process.env.TEMP||"",TMP:process.env.TMP||"",
      HOME:process.env.HOME||"",USERPROFILE:process.env.USERPROFILE||"",
      PGHOST:url.hostname,PGPORT:"5432",PGDATABASE:"postgres",PGUSER:USER,
      PGPASSWORD:pw,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"10",
      PGAPPNAME:"pr55_readonly_production_logical_backup",
      PGOPTIONS:"-c default_transaction_read_only=on"
    };
    if(process.argv.includes("--connection-check")) {
      try {
        const status=run(psql,["-X","-w","-A","-t","-v","ON_ERROR_STOP=1",
          "--command","SELECT CASE WHEN current_setting('transaction_read_only')='on' THEN 'READONLY_OK' ELSE 'WRITE_MODE' END;"],{
          env,timeout:20000,stage:"production read-only connection preflight"
        }).trim();
        if(status!=="READONLY_OK")
          throw new Error("read-only connection preflight: production connection not in read-only mode");
        console.log("PASS: production PostgreSQL Session pooler connection verified READ-ONLY; no backup or writes made");
      } catch(e) {
        console.error("FAIL:",e.message);
        process.exitCode=1;
      }
      return;
    }
    if(path.resolve(archiveDir).startsWith(path.resolve(process.cwd())+path.sep)){
      console.error("REFUSED: backup folder must be outside Git project");
      process.exitCode=2;return;
    }
    fs.mkdirSync(archiveDir,{recursive:true,mode:0o700});
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    const filename="cowl-dok-prod-"+stamp+"-"+randomBytes(3).toString("hex")+".backup";
    const finalFile=path.join(archiveDir,filename);
    const partial=finalFile+".partial";
    try{
      console.log("CHECK: exporting production Postgres logical data READ-ONLY; no database writes permitted");
      run(pgDump,["--format=custom","--no-password","--file",partial,"--dbname=postgres"],
        {env,timeout:180000,stage:"production read-only pg_dump"});
      const listing=run(pgRestore,["--list",partial],
        {timeout:30000,stage:"local archive catalog check"});
      const expected=[
        "TABLE DATA public members",
        "TABLE DATA public member_ministries",
        "TABLE DATA auth users",
        "TABLE DATA storage buckets",
        "TABLE DATA storage objects"
      ];
      for(const object of expected)
        if(!listing.includes(object))
          throw new Error("archive missing expected table-data entry: "+object);
      const stat=fs.statSync(partial);
      if(stat.size<4096)throw new Error("backup unexpectedly small");
      fs.renameSync(partial,finalFile);
      const hash=createHash("sha256");
      for await(const chunk of fs.createReadStream(finalFile))hash.update(chunk);
      console.log("PASS: production logical archive created and catalog verified");
      console.log("FILE (sensitive; keep encrypted): "+finalFile);
      console.log("BYTES: "+stat.size);
      console.log("SHA256: "+hash.digest("hex"));
      console.log("LIMIT: restore NOT proven; uploaded Storage file bytes and global roles/config NOT saved");
      console.log("NEXT: encrypt archive, protect an off-site copy, back up Storage bytes separately");
    } catch(e){
      try{if(fs.existsSync(partial))fs.unlinkSync(partial);}catch{}
      console.error("FAIL:",e.message);process.exitCode=1;
    }
  })().catch(()=>{
    console.error("FAIL: backup preflight interrupted (details redacted)");
    process.exitCode=1;
  });
} else {
  console.error("Usage: node scripts/pr55-production-readonly-backup.cjs --check-tools | --connection-check | --backup");
  process.exitCode=2;
}
