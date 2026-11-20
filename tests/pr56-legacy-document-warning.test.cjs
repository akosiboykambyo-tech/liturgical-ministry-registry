"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../app/admin/members/page.tsx"),"utf8");

test("member list distinguishes an unlinked legacy document from absent ministry evidence",()=>{
 assert.match(source,/const missingLetterMinistries = memberships/);
 assert.match(source,/\.filter\(\(membership\) => !membership\.document_url\)/);
 assert.match(source,/\.map\(\(membership\) => shortMinistry\(membership\.ministry\)\)/);
 assert.match(source,/const letterWarning = needsLetter/);
 assert.match(source,/m\.document_url/);
 assert.match(source,/Ministry letter not linked:/);
 assert.match(source,/older member-level letter exists; review coverage before linking/);
 assert.match(source,/Ministry recommendation letter missing:/);
 assert.match(source,/letterWarning,/);
});

test("validity warning describes registration expiration, never a recommendation-letter expiry",()=>{
 assert.match(source,/const registrationExpiringSoon = memberships\.some/);
 assert.match(source,/Registration Expiring Soon/);
 assert.doesNotMatch(source,/Letter Expiring Soon/);
 assert.doesNotMatch(source,/const letterExpiringSoon/);
});

test("legacy warning neither backfills evidence nor verifies ministry automatically",()=>{
 const block=source.slice(source.indexOf("const missingLetterMinistries = memberships"),source.indexOf("return (",source.indexOf("const missingLetterMinistries = memberships")));
 assert.doesNotMatch(block,/\.update\(|\.insert\(|\.upsert\(|\.rpc\(/);
 assert.match(block,/const needsLetter = missingLetterMinistries\.length > 0/);
});
