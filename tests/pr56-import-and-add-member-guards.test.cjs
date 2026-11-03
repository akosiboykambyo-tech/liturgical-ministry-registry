"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=(p)=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const add=read("app/admin/members/add/page.tsx");
const csv=read("app/admin/import/page.tsx");
test("legacy add member screen fails closed when secure verification is enabled",()=>{
 assert.match(add,/import \{ secureMinistryVerificationEnabled \} from "@\/lib\/secure-ministry-verification"/);
 const start=add.indexOf("const handleSubmit = async");
 assert.ok(start>=0);
 const body=add.slice(start,start+430);
 assert.match(body,/e\.preventDefault\(\)/);
 assert.match(body,/if \(secureMinistryVerificationEnabled\)/);
 assert.match(body,/return;/);
});
test("CSV and renewal mutation handlers are gated before any write is attempted",()=>{
 assert.match(csv,/import \{ secureMinistryVerificationEnabled \} from "@\/lib\/secure-ministry-verification"/);
 for(const handler of ["saveStagedReviewCases","processRenewalBatch","runImport","resolveMerge","resolveKeepSeparate"]){
  const start=csv.indexOf("const "+handler+" = async () => {");
  assert.ok(start>=0, "Missing "+handler);
  const body=csv.slice(start,start+350);
  assert.match(body,/if \(secureMinistryVerificationEnabled\)/);
  assert.match(body,/return;/);
 }
});
