"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const script=path.join(__dirname,"../scripts/pr55-private-restore-host-preflight.sh");
const src=fs.readFileSync(script,"utf8");
test("private Linux readiness check is offline and never transfers or restores production data",()=>{
 assert.match(src,/Read-only offline preflight/);
 assert.match(src,/uname -s/);
 assert.match(src,/docker info/);
 assert.match(src,/docker compose version/);
 assert.match(src,/pg_restore --version/);
 assert.match(src,/supabase_vault/);
 assert.match(src,/FULL RESTORE NOT CERTIFIED/);
 const forbidden=["curl ","wget ","scp ","rsync ","ssh ","pg_restore --dbname","docker pull","docker run","docker compose up","supabase start","supabase db dump","rm -rf","mktemp"];
 for(const word of forbidden) assert.equal(src.includes(word),false,"unexpected action: "+word);
});
test("preflight parses as Bash and rejects unsupported extra arguments",()=>{
 const parse=spawnSync("bash",["-n",script],{encoding:"utf8",timeout:6000});
 if(parse.error?.code==="ENOENT")return;
 assert.equal(parse.status,0,parse.stderr);
 const denied=spawnSync("bash",[script,"one","two"],{encoding:"utf8",timeout:6000});
 assert.equal(denied.status,2,denied.stderr);
});
