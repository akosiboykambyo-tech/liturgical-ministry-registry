"use strict";
// Zero-production-data Windows preflight for a pinned Supabase CLI binary.
// This test reproduces the executable invocation used by the recovery utility.
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const exe=process.argv[2];
assert.ok(exe && fs.existsSync(exe),"verified Windows Supabase binary required");
const targetVersion="2.84.2";
const direct=spawnSync(exe,["--version"],{encoding:"utf8",windowsHide:true});
const cmdText='"'+exe.replace(/"/g,'')+'" "--version"';
const viaCmd=spawnSync("cmd.exe",["/d","/s","/c",cmdText],{encoding:"utf8",windowsHide:true});
function summary(r){return {exitCode:r.status,errorCode:r.error?.code||null,stdout:String(r.stdout||"").trim().slice(0,100),stderr:String(r.stderr||"").trim().slice(0,100)}}
console.log("DIRECT_EXE_TEST",JSON.stringify(summary(direct)));
console.log("OLD_CMD_WRAPPER_TEST",JSON.stringify(summary(viaCmd)));
assert.equal(direct.status,0,"Direct Windows executable invocation failed");
assert.ok(direct.stdout.includes(targetVersion),"Pinned CLI version not in direct stdout");
const help=spawnSync(exe,["start","--help"],{encoding:"utf8",windowsHide:true});
console.log("DIRECT_HELP_RESULT",JSON.stringify({exitCode:help.status,networkFlag:(help.stdout+"\n"+help.stderr).includes("--network-id")}));
assert.equal(help.status,0,"CLI start help failed");
assert.ok((help.stdout+"\n"+help.stderr).includes("--network-id"),"Local-only Docker isolation flag not supported");
const work=fs.mkdtempSync(path.join(os.tmpdir(),"COWL DOK Recovery QA "));
try{
 const init=spawnSync(exe,["init"],{cwd:work,encoding:"utf8",windowsHide:true});
 console.log("DIRECT_INIT_RESULT",JSON.stringify({exitCode:init.status,configExists:fs.existsSync(path.join(work,"supabase","config.toml"))}));
 assert.equal(init.status,0,"CLI init failed in Windows directory with spaces");
 assert.ok(fs.existsSync(path.join(work,"supabase","config.toml")),"Local Supabase config missing");
} finally{
 fs.rmSync(work,{recursive:true,force:true,maxRetries:3});
}
console.log("PASS: PINNED WINDOWS CLI version, supported --network-id, direct EXE invocation and local init with spaces.");
