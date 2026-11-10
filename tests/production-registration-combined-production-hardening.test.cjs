"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const read=(name)=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const foundation=read("docs/sql/pr55-production-admin-foundation.REVIEW-ONLY.sql");
const cutover=read("docs/sql/pr55-production-admin-readonly-and-legacy-write-cutover.REVIEW-ONLY.sql");
const lab=read("docs/sql/pr55-staging-admin-acl-lab.ROLLBACK-ONLY.sql");
const ps=read("scripts/pr55-restore-host-readiness.ps1");
const docs=read("docs/pr55-combined-production-readiness-2026-10-29.md");

test("production admin foundation is unexecutable and never auto-seeds grants",()=>{
 assert.match(foundation,/BEGIN;[\s\S]*RAISE EXCEPTION 'PR55 NO-GO/);
 assert.match(foundation,/CREATE TABLE registry_private\.registration_administrators/);
 assert.match(foundation,/REFERENCES auth\.users\(id\)/);
 assert.match(foundation,/DEFAULT false/);
 assert.match(foundation,/ENABLE ROW LEVEL SECURITY/);
 assert.match(foundation,/REVOKE ALL ON TABLE registry_private\.registration_administrators/);
 assert.doesNotMatch(foundation,/INSERT INTO registry_private\.registration_administrators/);
});
test("production privilege migration aborts and demands proven admin and hardened RPC",()=>{
 assert.match(cutover,/BEGIN;[\s\S]*RAISE EXCEPTION 'PR55 NO-GO/);
 assert.match(cutover,/IF n<>1 THEN/);
 assert.match(cutover,/public\.registry_verify_ministries_v1/);
 assert.match(cutover,/Hardened renewal RPC not yet installed/);
 assert.match(cutover,/REVOKE ALL ON public\.members,public\.member_ministries/);
 assert.match(cutover,/GRANT SELECT ON public\.members,public\.member_ministries TO authenticated/);
 assert.match(cutover,/REVOKE ALL ON public\.recommendation_renewal_batches/);
 assert.doesNotMatch(cutover,/GRANT (INSERT|UPDATE|DELETE) ON public\.members/);
});
test("legacy fixed admin RLS and open renewal-history SELECT policies are replaced",()=>{
 assert.match(cutover,/DROP POLICY IF EXISTS registry_admin_members/);
 assert.match(cutover,/DROP POLICY IF EXISTS registry_admin_member_ministries/);
 assert.match(cutover,/DROP POLICY IF EXISTS authenticated_select_recommendation_renewal_batches/);
 assert.match(cutover,/DROP POLICY IF EXISTS authenticated_select_recommendation_renewal_memberships/);
 for(const policy of ["pr55_admin_read_members","pr55_admin_read_member_ministries","pr55_admin_read_renewal_batches","pr55_admin_read_renewal_memberships"]){
  assert.ok(cutover.includes("CREATE POLICY "+policy));
 }
 assert.doesNotMatch(cutover,/USING \(true\)/);
});
test("isolated ACL test uses transaction rollback and verifies both access classes",()=>{
 assert.match(lab,/^BEGIN;/m);
 assert.match(lab,/ROLLBACK;\s*$/);
 assert.match(lab,/CREATE SCHEMA registry_acl_lab/);
 assert.match(lab,/SET LOCAL ROLE authenticated/);
 assert.match(lab,/public\.registration_is_admin\(\)/);
 assert.match(lab,/Ungraned user can read synthetic history/);
 assert.match(lab,/Administrator retained legacy direct UPDATE/);
});
test("offline backup host preflight cannot restore, connect or copy private data",()=>{
 assert.match(ps,/READ-ONLY and OFFLINE/);
 assert.match(ps,/supabase_vault\.control/);
 assert.match(ps,/PostgreSQL\[\)] 17\[\.\]/);
 assert.match(ps,/Get-FileHash -LiteralPath \$ArchivePath -Algorithm SHA256/);
 assert.match(ps,/1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992/);
 assert.doesNotMatch(ps,/Invoke-RestMethod|Invoke-WebRequest|New-Item|Start-Service|--dbname=/);
 assert.match(docs,/full restoration was never certified/);
 assert.match(docs,/precisely 1 day shorter/);
});
test("backup PowerShell parses if pwsh is available",()=>{
 const f=path.join(__dirname,"..","scripts","pr55-restore-host-readiness.ps1");
 const command="$tokens=$null; $issues=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('"+f.replace(/'/g,"''")+"',[ref]$tokens,[ref]$issues); if($issues){$issues | Out-String | Write-Error; exit 1}";
 const result=spawnSync("pwsh",["-NoProfile","-NonInteractive","-Command",command],{encoding:"utf8",timeout:12000});
 if(result.error && result.error.code==="ENOENT")return;
 assert.equal(result.status,0,result.stderr);
});
