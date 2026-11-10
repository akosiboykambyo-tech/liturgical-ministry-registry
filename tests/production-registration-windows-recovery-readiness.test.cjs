"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const file=path.join(__dirname,"../scripts/pr55-windows-recovery-readiness.ps1");
const src=fs.readFileSync(file,"utf8");
test("Windows recovery readiness script checks hardware, disk, WSL and Docker without making changes",()=>{
 for(const text of ["Get-CimInstance Win32_OperatingSystem","Get-CimInstance Win32_ComputerSystem",
 "Get-CimInstance Win32_Processor","Get-CimInstance Win32_LogicalDisk","SecondLevelAddressTranslationExtensions",
 "VirtualizationFirmwareEnabled","wsl.exe","--status","docker.exe","READ-ONLY","no database restore was attempted"]){
  assert.ok(src.includes(text),"Missing "+text);
 }
 for(const forbidden of ["wsl --install","wsl.exe --install","docker pull","docker run","docker compose up",
 "Invoke-WebRequest","Invoke-RestMethod","Enable-WindowsOptionalFeature","Set-ItemProperty",
 "Set-ExecutionPolicy","Start-Process","pg_restore --dbname","supabase db dump"]){
  assert.equal(src.includes(forbidden),false,"Unsafe or undesired action: "+forbidden);
 }
});
test("PowerShell source parses when pwsh is installed in CI",()=>{
 const cmd="$tokens=$null;$problems=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('"+
  file.replace(/'/g,"''")+"',[ref]$tokens,[ref]$problems);if($problems){exit 1}";
 const result=spawnSync("pwsh",["-NoProfile","-NonInteractive","-Command",cmd],{encoding:"utf8",timeout:12000});
 if(result.error?.code==="ENOENT")return;
 assert.equal(result.status,0,result.stderr);
});
