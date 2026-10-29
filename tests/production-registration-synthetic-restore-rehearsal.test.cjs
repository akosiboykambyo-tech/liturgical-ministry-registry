"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const script=fs.readFileSync(path.join(__dirname,"../scripts/pr55-local-pg17-synthetic-restore-rehearsal.sh"),"utf8");
test("synthetic rehearsal refuses nonisolated container and performs strict fixture-only restore",()=>{
 for(const check of ["none|supabase/postgres:17.6.1.136|true","supabase_vault:0.3.1","createdb","--format=custom","--exit-on-error --single-transaction","synthetic-only","trap cleanup EXIT"])assert.ok(script.includes(check),check);
 for(const forbidden of ["https://","pg_dump --host","SUPABASE_URL","SERVICE_ROLE_KEY","--network host","-p 5432","--dbname=postgres"])assert.ok(!script.includes(forbidden),forbidden);
});
test("bash parses",()=>{
 const sh=spawnSync("bash",["-n",path.join(__dirname,"../scripts/pr55-local-pg17-synthetic-restore-rehearsal.sh")],{encoding:"utf8"});
 if(sh.error?.code==="ENOENT")return;
 assert.equal(sh.status,0,sh.stderr);
});
