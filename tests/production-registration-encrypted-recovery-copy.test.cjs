'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const source=path.join(__dirname,'../scripts/pr55-verify-encrypted-recovery-copy.cjs');
const wrapper=path.join(__dirname,'../scripts/pr55-verify-encrypted-recovery-copy.ps1');
test('synthetic decryption rejects tampered DB and Storage ciphertext',()=>{
 const p=spawnSync(process.execPath,[source,'--self-test'],{encoding:'utf8',timeout:12000});
 assert.equal(p.status,0,p.stderr);
 assert.match(p.stdout,/tamper-rejection/);
});
test('offline encrypted-copy verification is read-only and hash-checked',()=>{
 const a=fs.readFileSync(source,'utf8'),b=fs.readFileSync(wrapper,'utf8');
 for(const s of ['EXPECTED_DB_SHA','EXPECTED_ZIP_SHA','EXPECTED_STORAGE_ENC_SHA','aes-256-gcm','storageDecrypt(zipCopy','dbDecrypt(dbCopy','console.log("LIMIT:'])assert.ok(a.includes(s),s);
 for(const s of ['Get-Credential','Remove-Item Env:','protected-set-*'])assert.ok(b.includes(s),s);
 for(const bad of ['https://','fetch(','rclone ','pg_restore','docker run','supabase db','git push','rm -rf','fs.writeFileSync','fs.unlinkSync','execSync('])assert.ok(!a.includes(bad),bad);
 assert.ok(!b.includes('Invoke-RestMethod'));
});
