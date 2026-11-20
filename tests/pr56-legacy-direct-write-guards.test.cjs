"use strict";
const { test }=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const members=read("app/admin/members/page.tsx");
const detail=read("app/admin/members/[id]/page.tsx");
const quick=read("app/admin/verify/page.tsx");
const drawer=read("components/member-detail-drawer.tsx");
const actions=read("lib/verify-actions.ts");
test("legacy direct member edit/delete functions fail closed in secure mode",()=>{
 assert.match(members,/import \{ secureMinistryVerificationEnabled \} from "@\/lib\/secure-ministry-verification"/);
 for(const handler of ["handleSaveEdit","handleDelete"]){
  const start=members.indexOf("const "+handler+" = async () => {");
  assert.ok(start>=0,"missing "+handler);
  const next=members.slice(start,start+480);
  assert.match(next,/if \(secureMinistryVerificationEnabled\) \{/);
  assert.match(next,/return;/);
 }
});
test("member-wide document upload and deletion cannot bypass ministry-level attachment when secure mode enabled",()=>{
 for(const handler of ["handleUpload","handleDeleteDocument"]){
  const start=detail.indexOf("const "+handler+" = async");
  assert.ok(start>=0);
  assert.match(detail.slice(start,start+450),/if \(secureMinistryVerificationEnabled\) \{/);
  assert.match(detail.slice(start,start+450),/return;/);
 }
});
test("legacy mass upload, one-click verification, and drawer writes remain blocked",()=>{
 assert.match(quick,/const handleMassUpload = async \(file: File\) => \{\s*if \(secureMinistryVerificationEnabled\) return/);
 assert.match(quick,/return secureMinistryVerificationEnabled\s*\? <SecureMinistryVerification/);
 assert.match(actions,/if \(secureMinistryVerificationEnabled\)/);
 for(const handler of ["handleSave","handleUpload","handleDeleteDocument"]){
   const idx=drawer.indexOf("const "+handler+" = async");
   assert.ok(idx>0);
   assert.match(drawer.slice(idx,idx+360),/if \(secureMinistryVerificationEnabled\)/);
 }
});
