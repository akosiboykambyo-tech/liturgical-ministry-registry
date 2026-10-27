"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const file=path.join(__dirname,"../scripts/pr55-local-database-restore-rehearsal.ps1");
const content=fs.readFileSync(file,"utf8");
test("local Windows restore refuses ambient remote Postgres settings and targets localhost only",()=>{
  assert.match(content,/\[switch\]\$Preflight,\[switch\]\$Run/);
  assert.match(content,/\$env:PGHOST="127\.0\.0\.1"/);
  assert.match(content,/--host=127\.0\.0\.1/);
  assert.match(content,/listen_addresses = '127\.0\.0\.1'/);
  assert.match(content,/PGHOSTADDR","PGSERVICE","PGSERVICEFILE","PGOPTIONS"/);
  assert.match(content,/NewGuid\(\)/);
  assert.match(content,/PR55-LOCAL-RESTORE-REHEARSALS/);
  assert.match(content,/--auth-host=scram-sha-256/);
  assert.match(content,/--no-password --no-owner --no-privileges --single-transaction --exit-on-error/);
  assert.doesNotMatch(content,/aws-\d.*pooler|db\.zlvofcwnpdzfdnipvbbd|rtptybxugjhvpfjvcvgw/);
});
test("local Windows restore validates private original hash before starting server and never removes real backups",()=>{
  assert.match(content,/1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992/);
  assert.match(content,/Get-FileHash -LiteralPath \$archive -Algorithm SHA256/);
  assert.match(content,/if\(\$Preflight\)/);
  assert.match(content,/if\(\$stopped -and \(Test-Path -LiteralPath \$data -PathType Container\)\)/);
  assert.doesNotMatch(content,/Remove-Item -LiteralPath \$archive/);
  assert.match(content,/storage\.objects/);
});
test("local Windows restore PowerShell parses successfully when pwsh is present",()=>{
  const escape=file.replace(/'/g,"''");
  const cmd="$tokens=$null; $issues=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('"+escape+"',[ref]$tokens,[ref]$issues); if($issues){$issues | Out-String | Write-Error; exit 1}";
  const r=spawnSync("pwsh",["-NoProfile","-NonInteractive","-Command",cmd],{encoding:"utf8",timeout:15000});
  if(r.error&&r.error.code==="ENOENT")return;
  assert.equal(r.status,0,r.stderr);
});
