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
const HOST="aws-0-ap-southeast-2.pooler.supabase.com";
const USER="postgres."+REF;
const OPT_IN="I_ACCEPT_READONLY_PRODUCTION_LOGICAL_BACKUP";
const archiveDir=path.join(os.homedir(),"COWL-DOK-PRIVATE-BACKUPS");
function tool(name) {
  const win="C:\\Program Files\\PostgreSQL\\18\\bin\\"+name+".exe";
  return process.platform==="win32"&&fs.existsSync(win)?win:name;
}
const pgDump=tool("pg_dump");
const pgRestore=tool("pg_restore");
function run(program,args,options={}) {
  const r=spawnSync(program,args,{
    encoding:"utf8",windowsHide:true,timeout:options.timeout||20000,
    env:options.env||process.env,maxBuffer:8*1024*1024
  });
  if(r.error||r.status!==0) {
    const reason=r.error?.code==="ENOENT"?"client executable unavailable":
      r.error?.code==="ETIMEDOUT"?"client process timed out":
      r.error?.code==="EACCES"?"client executable permission denied":
      r.signal?"client process terminated":"client exited unsuccessfully";
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
} else if(process.argv.includes("--backup")) {
  (async()=>{
    if(process.env.PR55_ALLOW_PRODUCTION_BACKUP!==OPT_IN){
      console.error("REFUSED: explicit production read-only backup opt-in required");
      process.exitCode=2;return;
    }
    let url;
    try {url=new URL(process.env.PR55_PRODUCTION_DATABASE_URL||"");}
    catch{console.error("REFUSED: production database URL missing");process.exitCode=2;return;}
    if(!["postgres:","postgresql:"].includes(url.protocol)||
       url.hostname!==HOST||url.port!=="5432"||url.pathname!=="/postgres"||
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
    const env={
      PATH:process.env.Path||process.env.PATH||"",
      SystemRoot:process.env.SystemRoot||"",
      TEMP:process.env.TEMP||"",TMP:process.env.TMP||"",
      HOME:process.env.HOME||"",USERPROFILE:process.env.USERPROFILE||"",
      PGHOST:HOST,PGPORT:"5432",PGDATABASE:"postgres",PGUSER:USER,
      PGPASSWORD:pw,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"10",
      PGAPPNAME:"pr55_readonly_production_logical_backup",
      PGOPTIONS:"-c default_transaction_read_only=on"
    };
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
  console.error("Usage: node scripts/pr55-production-readonly-backup.cjs --check-tools | --backup");
  process.exitCode=2;
}
