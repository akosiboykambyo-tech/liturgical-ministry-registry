#!/usr/bin/env node
/**
 * PR56 isolated staging: real private-letter review in Chromium.
 * Creates ONE synthetic member with TWO pending assignments and ONE
 * synthetic PDF. Does NOT click Verify or renew any assignment.
 * Always attempts exact-identity cleanup through authenticated RPC
 * and object deletion through Storage API. --cleanup-only for recovery.
 * No credentials, JWTs, PDFs, or personal data printed to stdout.
 */
"use strict";
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {spawn}=require("node:child_process");
const net=require("node:net");
const path=require("node:path");
const {createClient}=require("@supabase/supabase-js");

const REF="rtptybxugjhvpfjvcvgw";
const SUPABASE_URL="https://"+REF+".supabase.co";
const HOST="http://127.0.0.1:3198";
const OPT_IN="I_ACCEPT_STAGING_SYNTHETIC_LETTER_BROWSER_TEST";
const env=process.env,mode=process.argv[2];
const pub=env.PR55_STAGING_PUBLISHABLE_KEY||"";
const email=env.PR55_STAGING_AUTH_EMAIL||"";
const password=env.PR55_STAGING_AUTH_PASSWORD||"";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET="member-documents";
function refuse(message){console.error("REFUSED: "+message);process.exit(2);}
if(process.argv.length!==3 || !["--validate-config","--run","--cleanup-only"].includes(mode))
 refuse("use --validate-config, --run, or --cleanup-only");
if(env.PR56_ALLOW_LETTER_BROWSER_E2E!==OPT_IN)
 refuse("explicit isolated staging synthetic-write opt-in is required");
if(!pub.startsWith("sb_publishable_")||!email||!password)
 refuse("staging publishable key and staging administrator credentials are required");
if(mode==="--validate-config"){
 console.log("PASS: isolated staging letter-browser configuration; NO requests or writes made");
 process.exit(0);
}
const client=createClient(SUPABASE_URL,pub,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
function ensureData(result,what){
 if(result.error||!result.data)throw Error(what+" failed; inspect staging API logs");
 return result.data;
}
async function count(table,query){
 let r=client.from(table).select("id",{head:true,count:"exact"});
 if(query)for(const [key,value] of Object.entries(query))r=r.eq(key,value);
 const {count,error}=await r;
 if(error||count===null)throw Error("Unable to inspect "+table+" baseline");
 return count;
}
async function authenticate(){
 const result=await client.auth.signInWithPassword({email,password});
 if(result.error || !result.data?.session?.access_token)throw Error("Staging administrator authentication failed");
 console.log("PASS: real staging administrator authenticated");
 return result.data.session;
}
async function ensureBaseline(members,assignments){
 const m=await count("members"),a=await count("member_ministries");
 if(m!==members||a!==assignments)throw Error("Unexpected staging inventory; refusing test");
}
async function assertNoFixture(){
 const result=await client.from("members").select("id",{head:true,count:"exact"})
  .eq("first_name","PR56REVIEW").eq("last_name","Synthetic")
  .like("notes","PR56REVIEW test-only nonce: %");
 if(result.error||result.count!==0)
  throw Error("Existing PR56 synthetic fixture detected; run --cleanup-only");
}
function fakePdf(){
 const payload="BT /F1 12 Tf 24 100 Td (PR56 SYNTHETIC TEST LETTER - NO PERSONAL DATA) Tj ET\n";
 const objs=[
 "<< /Type /Catalog /Pages 2 0 R >>",
 "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
 "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 150] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
 "<< /Length "+Buffer.byteLength(payload)+" >>\nstream\n"+payload+"endstream",
 "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
 ];
 let data="%PDF-1.4\n",offsets=[0];
 for(const [i,obj] of objs.entries()){offsets.push(Buffer.byteLength(data));data+=(i+1)+" 0 obj\n"+obj+"\nendobj\n";}
 const xref=Buffer.byteLength(data);
 data+="xref\n0 6\n0000000000 65535 f \n";
 for(const off of offsets.slice(1))data+=String(off).padStart(10,"0")+" 00000 n \n";
 data+="trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
 return Buffer.from(data);
}
async function safeCleanup(fixture,pdfPath){
 // Only the nonce-matched test member/assignments can be deleted by the
 // admin-authenticated SECURITY DEFINER cleanup RPC. Never delete SQL Storage rows.
 let deleted=!fixture;
 if(fixture){
  let outcome;
  try{outcome=await client.rpc("pr56_review_finish_v1",{
   p_member_id:fixture.member_id,p_nonce:fixture.nonce
  });}catch(_error){outcome={error:true};}
  deleted=!outcome.error&&outcome.data?.cleaned===true;
  if(deleted)console.log("PASS: deleted synthetic browser-test member and two assignments");
  else console.error("CLEANUP REQUIRED: synthetic staging member "+fixture.member_id);
 }
 if(pdfPath && deleted){
  let removed;
  try{removed=await client.storage.from(BUCKET).remove([pdfPath]);}
  catch(_error){removed={error:true};}
  if(removed.error)console.error("CLEANUP REQUIRED: synthetic private path "+pdfPath);
  else console.log("PASS: deleted synthetic PDF through private Storage API");
  if(removed.error) return false;
 }else if(pdfPath){
  console.error("CLEANUP REQUIRED: synthetic private path "+pdfPath);
 }
 return deleted;
}
async function recover(){
 await authenticate();
 const matches=await client.from("members")
  .select("id,first_name,last_name,parish,notes")
  .eq("first_name","PR56REVIEW").eq("last_name","Synthetic")
  .eq("parish","Staging Test Parish")
  .like("notes","PR56REVIEW test-only nonce: %").limit(3);
 if(matches.error||matches.data?.length!==1)
  throw Error("Cleanup refuses ambiguous/missing synthetic member");
 const member=matches.data[0],nonce=/^PR56REVIEW test-only nonce: ([0-9a-f-]{36})$/i.exec(member.notes||"")?.[1];
 if(!UUID.test(member.id)||!nonce||!UUID.test(nonce))
  throw Error("Synthetic member identity or nonce mismatch");
 const assignments=await client.from("member_ministries")
  .select("id,member_id,ministry,status,document_url").eq("member_id",member.id);
 if(assignments.error||assignments.data?.length!==2)
  throw Error("Cleanup refuses unexpected synthetic assignment inventory");
 const first=assignments.data.find(x=>x.ministry==="Ministry of Lectors and Commentators");
 const second=assignments.data.find(x=>x.ministry==="Ministry of Liturgical Music");
 if(!first||!second||first.id===second.id||!UUID.test(first.id)||
    first.member_id!==member.id||second.member_id!==member.id||
    first.status!=="Pending Verification"||second.status!=="Pending Verification"||
    second.document_url!==null)
  throw Error("Cleanup refuses changed synthetic assignment state");
 const folder="verification/"+member.id+"/"+first.id;
 const expected=new RegExp("^verification/"+member.id+"/"+first.id+"/[0-9a-f-]{36}[.]pdf$","i");
 const pdfPath=first.document_url;
 if(typeof pdfPath!=="string"||!expected.test(pdfPath))
  throw Error("Cleanup refuses unexpected document path");
 const listing=await client.storage.from(BUCKET).list(folder,{limit:10});
 if(listing.error||!Array.isArray(listing.data)||listing.data.length!==1||
    listing.data[0].name!==pdfPath.slice(folder.length+1))
  throw Error("Cleanup refuses unexpected private Storage contents");
 const ok=await safeCleanup({member_id:member.id,nonce},pdfPath);
 if(!ok)throw Error("Cleanup incomplete; investigate printed synthetic path/ID");
 await ensureBaseline(1008,12);
 const remaining=await client.storage.from(BUCKET).list(folder,{limit:10});
 if(remaining.error||remaining.data?.length!==0)
  throw Error("Cleanup cannot confirm private Storage removal");
 console.log("PASS: cleanup-only restored isolated staging baseline");
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function checkPort(){
 await new Promise((resolve,reject)=>{
  const server=net.createServer();
  server.once("error",()=>reject(Error("Dedicated localhost port 3198 already in use")));
  server.listen(3198,"127.0.0.1",()=>server.close(resolve));
 });
}
async function ready(child){
 const until=Date.now()+90000;
 while(Date.now()<until){
  if(child.exitCode!==null)throw Error("Local test server exited unexpectedly");
  try{
   const r=await fetch(HOST+"/admin/verification?tab=reviews&view=approvals",{
    signal:AbortSignal.timeout(3500),cache:"no-store"
   });
   if([200,307,308].includes(r.status))return;
  }catch(_error){}
  await wait(750);
 }
 throw Error("Local staging test server did not become ready");
}
async function run(){
 let chromium;
 try{({chromium}=require("playwright"));}catch(_error){
  throw Error("Playwright is required for the browser test");
 }
 await checkPort();
 const session=await authenticate();
 await ensureBaseline(1008,12);
 await assertNoFixture();
 let fixture=null,pdfPath=null,browser=null,child=null,primaryError=null,cleanupOk=false;
 try{
  const nonce=randomUUID();
  const started=await client.rpc("pr56_review_begin_v1",{p_nonce:nonce});
  fixture=ensureData(started,"Synthetic fixture setup");
  assert.equal(fixture.nonce,nonce);
  for(const id of [fixture.member_id,fixture.first_id,fixture.second_id])
   assert.ok(UUID.test(id),"invalid fixture identity");
  console.log("PASS: created one synthetic minister with two pending assignments");

  pdfPath="verification/"+fixture.member_id+"/"+fixture.first_id+"/"+randomUUID()+".pdf";
  const upload=await client.storage.from(BUCKET).upload(pdfPath,fakePdf(),{
   upsert:false,contentType:"application/pdf"
  });
  if(upload.error)throw Error("Synthetic private Storage upload failed");
  const attached=await client.rpc("registry_attach_ministry_letter_v1",{
   p_member_id:fixture.member_id,p_membership_id:fixture.first_id,
   p_document_path:pdfPath
  });
  const linked=ensureData(attached,"Attach synthetic letter");
  assert.equal(linked.attached,true);
  console.log("PASS: attached one synthetic private PDF without verification");

  const envLocal={...process.env,NODE_ENV:"development",
   NEXT_PUBLIC_SUPABASE_URL:SUPABASE_URL,
   NEXT_PUBLIC_SUPABASE_ANON_KEY:pub,
   NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION:"enabled",
   SUPABASE_SERVICE_ROLE_KEY:"",
   ADMIN_LOCKOUT_HMAC_SECRET:"",
   VERIFICATION_RATE_LIMIT_SECRET:"",
   RESEND_API_KEY:""
  };
  const next=require.resolve("next/dist/bin/next");
  child=spawn(process.execPath,[next,"dev","-p","3198","-H","127.0.0.1"],{
   cwd:path.join(__dirname,".."),env:envLocal,stdio:["ignore","pipe","pipe"],
   windowsHide:true
  });
  child.stdout?.on("data",()=>{});
  child.stderr?.on("data",()=>{});
  await ready(child);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
  await context.addInitScript(({key,value})=>{
   if(location.origin==="http://127.0.0.1:3198")
    localStorage.setItem(key,JSON.stringify(value));
  },{key:"sb-"+REF+"-auth-token",value:session});
  const page=await context.newPage();
  await page.goto(HOST+"/admin/verification?tab=reviews&view=approvals",{
   waitUntil:"domcontentloaded",timeout:60000
  });
  await page.getByRole("heading",{name:"Verify Ministry Assignments"})
   .waitFor({state:"visible",timeout:60000});
  const article=page.locator("article").filter({hasText:"PR56REVIEW Synthetic"});
  await article.getByRole("button",{name:"Review ministries"}).click();
  const dialog=page.getByRole("dialog",{name:"Choose ministry assignments to verify"});
  await dialog.waitFor({state:"visible",timeout:12000});
  const toggles=dialog.locator('input[type="checkbox"]');
  assert.equal(await toggles.count(),2);
  assert.equal(await toggles.nth(0).isDisabled(),true);
  assert.equal(await toggles.nth(1).isDisabled(),true);
  assert.equal(await dialog.getByRole("button",{name:"Verify 0 selected"}).isDisabled(),true);

  const prepare=dialog.getByRole("button",{name:"Prepare secure letter link"});
  assert.equal(await prepare.count(),1);
  await prepare.click();
  const open=dialog.getByRole("link",{name:"Open recommendation letter (new tab)"});
  await open.waitFor({state:"visible",timeout:15000});
  const signedHref=await open.getAttribute("href");
  if(!signedHref)throw Error("Private signed URL was not generated");
  const signed=new URL(signedHref);
  if(signed.origin!==SUPABASE_URL ||
     !signed.pathname.startsWith("/storage/v1/object/sign/member-documents/verification/"))
   throw Error("Private letter link points outside the isolated storage service");
  const pdf=await context.request.get(signedHref,{timeout:15000});
  if(pdf.status()!==200)throw Error("Private signed URL did not return the synthetic PDF");
  const pdfBody=await pdf.body();
  if(pdfBody.subarray(0,5).toString()!=="%PDF-")
   throw Error("Private signed URL returned unexpected content");
  console.log("PASS: browser produced a five-minute private signed URL serving the correct PDF");

  // The acknowledgment happens on click, not merely on signed URL creation.
  assert.equal(await toggles.nth(0).isDisabled(),true);
  const others=await Promise.all([toggles.nth(0).isDisabled(),toggles.nth(1).isDisabled()]);
  assert.ok(others.every(Boolean));
  await open.click({noWaitAfter:true});
  // Select only the ministry with a linked and opened PDF.
  const firstRow=dialog.locator("div.border.p-3").filter({hasText:"Ministry of Lectors and Commentators"}).first();
  const selectedToggle=firstRow.locator('input[type="checkbox"]');
  await selectedToggle.waitFor({state:"visible"});
  assert.equal(await selectedToggle.isEnabled(),true);
  const otherRow=dialog.locator("div.border.p-3").filter({hasText:"Ministry of Liturgical Music"}).first();
  assert.equal(await otherRow.locator('input[type="checkbox"]').isDisabled(),true);
  await selectedToggle.check();
  assert.equal(await dialog.getByRole("button",{name:"Verify 1 selected"}).isEnabled(),true);
  console.log("PASS: opening the letter enables only its ministry's approval selection; no verification was submitted");

  await page.setViewportSize({width:390,height:844});
  await dialog.waitFor({state:"visible"});
  assert.equal(await dialog.getByRole("button",{name:"Verify 1 selected"}).isEnabled(),true);
  console.log("PASS: private-letter review controls remain usable at mobile width");

  const rows=await client.from("member_ministries")
   .select("id,status,expiration_date").eq("member_id",fixture.member_id);
  if(rows.error||rows.data?.length!==2||rows.data.some(x=>
    x.status!=="Pending Verification"||x.expiration_date!==null))
   throw Error("Browser smoke unexpectedly changed a ministry assignment");
  await ensureBaseline(1009,14);
  console.log("PASS: browser review produced no registry verification or renewal write");
 }catch(err){primaryError=err;}
 finally{
  if(browser)try{await browser.close();}catch(_error){}
  if(child){child.kill();await wait(500);}
  if(fixture||pdfPath)cleanupOk=await safeCleanup(fixture,pdfPath);
  try{await client.auth.signOut();}catch(_error){}
 }
 if(primaryError)throw primaryError;
 if(!cleanupOk)throw Error("Staging synthetic fixture cleanup unconfirmed");
 // Read-back counts require fresh Auth; cleanup-only is available on failure.
 console.log("PASS: isolated staging private-letter browser test and cleanup completed");
}
(mode==="--cleanup-only"?recover():run())
 .then(async()=>{try{await client.auth.signOut();}catch(_error){}})
 .catch(_error=>{
  console.error("FAIL: staging browser test or cleanup incomplete; use --cleanup-only before any rerun");
  process.exitCode=1;
 });
