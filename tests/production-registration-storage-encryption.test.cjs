"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {createHash}=require("node:crypto");
const script=path.join(__dirname,"../scripts/pr55-protect-storage-backup.cjs");
const hash=(b)=>createHash("sha256").update(b).digest("hex");
const pass="Synthetic-Long-Offline-Storage-Phrase-Only";
function invoke(mode,env,timeout=20000){
  return spawnSync(process.execPath,[script,mode],{env:{PATH:process.env.PATH||"",SystemRoot:process.env.SystemRoot||"",...env},encoding:"utf8",timeout});
}
test("Storage AES-GCM synthetic self-test rejects tampering offline",()=>{
  const p=invoke("--self-test",{});
  assert.equal(p.status,0,p.stderr);
  assert.match(p.stdout,/PASS: Storage encryption synthetic self-test/);
});
test("Storage ZIP encryption streams, verifies, resists overwrite and tampering",()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),"cowl-dok-enc-test-"));
  try{
    const dir=path.join(home,"COWL-DOK-PRIVATE-BACKUPS");
    fs.mkdirSync(dir);
    const zip=path.join(dir,"cowl-dok-storage-prod-20261027-091301.zip");
    const payload=Buffer.concat([Buffer.from([0x50,0x4b,0x05,0x06]),Buffer.alloc(1024*1024+19,53)]);
    fs.writeFileSync(zip,payload);
    const expected=hash(payload);
    const env={HOME:home,USERPROFILE:home,PR55_STORAGE_ZIP:zip,PR55_STORAGE_ZIP_SHA256:expected,PR55_STORAGE_PASSPHRASE:pass};
    const encrypted=invoke("--encrypt",env);
    assert.equal(encrypted.status,0,encrypted.stderr);
    assert.match(encrypted.stdout,/PASS: Storage ZIP encrypted/);
    assert.equal(fs.existsSync(zip+".enc"),true);
    const verify=invoke("--verify",env);
    assert.equal(verify.status,0,verify.stderr);
    assert.match(verify.stdout,/PASS: Storage encrypted ZIP independently authenticated/);
    const existing=fs.readFileSync(zip+".enc");
    const second=invoke("--encrypt",env);
    assert.equal(second.status,1);
    assert.deepEqual(fs.readFileSync(zip+".enc"),existing,"existing encrypted archive must not be deleted or overwritten");
    existing[existing.length-1]^=1;
    fs.writeFileSync(zip+".enc",existing);
    const tampered=invoke("--verify",env);
    assert.equal(tampered.status,1);
    assert.match(tampered.stderr,/FAIL/);
    assert.deepEqual(fs.readFileSync(zip),payload,"plaintext source must never be modified");
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test("Storage backup guard requires private ZIP, exact SHA256 and 20+ character phrase",()=>{
  const invalid=invoke("--encrypt",{PR55_STORAGE_PASSPHRASE:"short"});
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/FAIL/);
});

test("Storage package PowerShell script has valid parse tree when pwsh is available",()=>{
  const target=path.join(__dirname,"../scripts/pr55-package-storage-backup.ps1");
  const escaped=target.replace(/'/g,"''");
  const command="$tokens=$null; $errorsFound=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('"+escaped+"',[ref]$tokens,[ref]$errorsFound); if($errorsFound){$errorsFound | Out-String | Write-Error; exit 1}";
  const r=spawnSync("pwsh",["-NoProfile","-NonInteractive","-Command",command],{encoding:"utf8",timeout:15000});
  if(r.error&&r.error.code==="ENOENT")return; // e.g. Windows installation lacking PowerShell 7
  assert.equal(r.status,0,r.stderr);
});
