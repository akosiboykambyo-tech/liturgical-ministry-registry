"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const target=path.join(__dirname,"../scripts/pr55-protect-current-recovery-set.ps1");
const src=fs.readFileSync(target,"utf8");
test("protected recovery set is offline and fails closed on checksum, manifest or credential error",()=>{
 for(const part of [
   "Get-FileHash", "Import-Csv", "manifest-private.csv", "Check-Exit", "NO-GO:",
   "certificate-templates", "member-documents", "-eq 36", "-eq 1", "-eq 36863212", "-eq 171973",
   "ZipFile]::CreateFromDirectory", "ZipFile]::OpenRead", "ComputeHash($stream)",
   "Get-Credential", "--verify", "--encrypt", "pr55-protect-local-backup.cjs",
   "pr55-protect-storage-backup.cjs", "Copy-And-Verify", "Passphrase", "D:\\COWL-DOK-PRIVATE-BACKUPS",
   "second LOCAL", "not an independent/offsite", "-not (Test-Path -LiteralPath $target)"
 ]) assert.ok(src.includes(part),"Missing expected guard: "+part);
 for(const dangerous of [
   "supabase db push", "rclone sync", "rclone move", "rclone delete", "rclone purge",
   "pg_restore", "git push", "gh pr merge", "Invoke-RestMethod", "Invoke-WebRequest",
   "Start-Process", "Remove-Item -Recurse", "rm -rf", "-Force:$true"
 ]) assert.ok(!src.includes(dangerous),"Unexpected risky command: "+dangerous);
 assert.match(src,/PR55_BACKUP_ENCRYPTION_PASSPHRASE\s*=\s*\$dbCred/);
 assert.match(src,/PR55_STORAGE_PASSPHRASE\s*=\s*\$storageCred/);
});
test("user profile and project secret paths are not hardcoded",()=>{
 assert.doesNotMatch(src,/Gerard Felarca|zlvofcwnpdzfdnipvbbd|cowl-dok-prod-2026-10-30T/);
});
