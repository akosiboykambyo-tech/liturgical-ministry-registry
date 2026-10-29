#!/usr/bin/env node
/**
 * Positive PR55 verification E2E through REAL Supabase Auth + Storage + RPC.
 * Isolated staging project only. Creates one synthetic member and two
 * assignments, uploads a synthetic PDF, attaches it, verifies ONLY one
 * assignment, asserts statuses/expiry, and cleans up in finally.
 *
 * Run only with both staging Auth passwords and an explicit opt-in.
 * Never uses service_role, database URLs, or production credentials.
 */
"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const STAGING_URL = "https://rtptybxugjhvpfjvcvgw.supabase.co";
const OPT_IN = "I_ACCEPT_STAGING_SYNTHETIC_WRITES_WITH_CLEANUP";
const env = process.env;
const args = process.argv.slice(2);
const required = [
 "PR55_STAGING_PUBLISHABLE_KEY","PR55_STAGING_AUTH_EMAIL",
 "PR55_STAGING_AUTH_PASSWORD","PR55_STAGING_NONADMIN_AUTH_EMAIL",
 "PR55_STAGING_NONADMIN_AUTH_PASSWORD"
];
function failClosed(msg) {
 console.error("REFUSED: "+msg);
 process.exit(2);
}
if (args.length!==1 || !["--validate-config","--run"].includes(args[0]))
 failClosed("specify exactly --validate-config or --run");
if (env.PR55_ALLOW_POSITIVE_E2E!==OPT_IN)
 failClosed("explicit isolated staging synthetic-write consent is required");
if (required.some(name=>!env[name]))
 failClosed("staging publishable key and both staging Auth credentials are required");
if (env.PR55_STAGING_AUTH_EMAIL.trim().toLowerCase()===
    env.PR55_STAGING_NONADMIN_AUTH_EMAIL.trim().toLowerCase())
 failClosed("staging admin and nonadmin emails must differ");
if (!env.PR55_STAGING_PUBLISHABLE_KEY.startsWith("sb_publishable_"))
 failClosed("a staging sb_publishable_ key is required");
if (args[0]==="--validate-config") {
 console.log("PASS: isolated staging positive E2E configuration; NO requests or writes made");
 process.exit(0);
}
function client() {
 return createClient(STAGING_URL,env.PR55_STAGING_PUBLISHABLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
}
async function signIn(client,email,password,label){
 const { data,error }=await client.auth.signInWithPassword({email,password});
 if (error || !data?.user?.id || !data?.session?.access_token)
  throw Error(label+" staging sign-in failed; check this test account's Supabase Auth credentials");
 console.log("PASS: "+label+" authenticated");
 return data.user.id;
}
function pdfFixture(){
 const contents="BT /F1 12 Tf 30 100 Td (PR55 SYNTHETIC TEST LETTER - NO PERSONAL DATA) Tj ET\n";
 const objects=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  "<< /Length "+Buffer.byteLength(contents)+" >>\nstream\n"+contents+"endstream",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
 ];
 let text="%PDF-1.4\n";
 const offsets=[0];
 objects.forEach((value,index)=>{
  offsets.push(Buffer.byteLength(text));
  text+=(index+1)+" 0 obj\n"+value+"\nendobj\n";
 });
 const xrefOffset=Buffer.byteLength(text);
 text+="xref\n0 6\n0000000000 65535 f \n";
 offsets.slice(1).forEach(off=>{text+=String(off).padStart(10,"0")+" 00000 n \n";});
 text+="trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xrefOffset+"\n%%EOF\n";
 return Buffer.from(text);
}
function expectedManilaExpiry(){
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date());
 const year=Number(parts.find(p=>p.type==="year").value);
 const month=Number(parts.find(p=>p.type==="month").value);
 const day=Number(parts.find(p=>p.type==="day").value);
 const maxDay=new Date(Date.UTC(year+1,month,0)).getUTCDate();
 return [String(year+1),String(month).padStart(2,"0"),
  String(Math.min(day,maxDay)).padStart(2,"0")].join("-");
}
function mustData(data,error,description){
 if(error || !data) throw Error(description+" failed (see staging API logs; no credentials printed)");
 return data;
}
async function main(){
 const admin=client(),nonadmin=client();
 let fixture=null,storagePath=null,primaryError=null;
 let cleanupErrors=[];
 const nonce=randomUUID();
 try{
  const aid=await signIn(admin,env.PR55_STAGING_AUTH_EMAIL,
   env.PR55_STAGING_AUTH_PASSWORD,"staging administrator");
  const otherId=await signIn(nonadmin,env.PR55_STAGING_NONADMIN_AUTH_EMAIL,
   env.PR55_STAGING_NONADMIN_AUTH_PASSWORD,"staging non-administrator");
  assert.notEqual(aid,otherId);

  const negative=await nonadmin.rpc("pr55_e2e_begin_v1",{p_nonce:randomUUID()});
  if(!negative.error || negative.error.code!=="42501")
   throw Error("nonadmin unexpectedly reached synthetic fixture creation");
  console.log("PASS: nonadmin fixture creation denied");

  const started=await admin.rpc("pr55_e2e_begin_v1",{p_nonce:nonce});
  fixture=mustData(started.data,started.error,"synthetic fixture setup");
  for(const prop of ["member_id","first_id","second_id"])
   assert.match(fixture[prop]||"",/^[0-9a-f-]{36}$/i);
  assert.equal(fixture.nonce,nonce);
  console.log("PASS: created isolated synthetic pending minister with two ministries");

  const nonadminRows=await nonadmin.from("member_ministries")
   .select("id").eq("member_id",fixture.member_id);
  if(nonadminRows.error || (nonadminRows.data||[]).length!==0)
   throw Error("nonadmin gained access to synthetic assignment");
  console.log("PASS: nonadmin cannot read synthetic assignment");

  storagePath="verification/"+fixture.member_id+"/"+fixture.first_id+"/"+randomUUID()+".pdf";
  const unauthorizedUpload=await nonadmin.storage.from("member-documents")
   .upload(storagePath,pdfFixture(),{contentType:"application/pdf",upsert:false});
  if(!unauthorizedUpload.error)
   throw Error("nonadmin unexpectedly uploaded a private ministry letter");
  console.log("PASS: nonadmin private Storage upload denied");

  const uploaded=await admin.storage.from("member-documents")
   .upload(storagePath,pdfFixture(),{contentType:"application/pdf",upsert:false});
  if(uploaded.error) throw Error("staging Storage upload failed");
  console.log("PASS: synthetic PDF uploaded through authenticated private Storage API");

  const attached=await admin.rpc("registry_attach_ministry_letter_v1",{
   p_member_id:fixture.member_id,p_membership_id:fixture.first_id,
   p_document_path:storagePath
  });
  const linked=mustData(attached.data,attached.error,"attach one ministry-specific letter");
  assert.equal(linked.attached,true);
  assert.equal(linked.membership_id,fixture.first_id);
  const before=await admin.from("member_ministries")
   .select("id,status,expiration_date,document_url").eq("member_id",fixture.member_id);
  if(before.error || before.data.length!==2) throw Error("could not read before-verification assignments");
  assert.ok(before.data.every(row=>row.status==="Pending Verification" && row.expiration_date===null));
  assert.equal(before.data.find(row=>row.id===fixture.first_id).document_url,storagePath);
  console.log("PASS: letter attached; no assignment status or expiry changed");

  const verified=await admin.rpc("registry_verify_ministries_v1",{
   p_member_id:fixture.member_id,p_membership_ids:[fixture.first_id],
   p_status:"New"
  });
  const result=mustData(verified.data,verified.error,"verify selected ministry");
  assert.equal(result.updated_assignments,1);
  assert.equal(result.member_status,"Pending Verification");
  assert.equal(result.expires_on,expectedManilaExpiry());

  const after=await admin.from("member_ministries")
   .select("id,status,expiration_date").eq("member_id",fixture.member_id);
  if(after.error||after.data.length!==2)throw Error("cannot confirm post-verification assignment state");
  const selected=after.data.find(row=>row.id===fixture.first_id);
  const untouched=after.data.find(row=>row.id===fixture.second_id);
  assert.equal(selected.status,"New");
  assert.equal(selected.expiration_date,expectedManilaExpiry());
  assert.equal(untouched.status,"Pending Verification");
  assert.equal(untouched.expiration_date,null);
  const member=await admin.from("members").select("status").eq("id",fixture.member_id).single();
  if(member.error)throw Error("could not read post-verification member summary");
  assert.equal(member.data.status,"Pending Verification");
  console.log("PASS: real HTTP attach + verify; selected ministry valid for one year; other ministry and member summary still pending");
 }catch(error){
  primaryError=error;
 }finally{
  if(fixture){
   const done=await admin.rpc("pr55_e2e_finish_v1",{
    p_member_id:fixture.member_id,p_nonce:nonce
   }).catch(()=>({data:null,error:true}));
   if(done.error || done.data?.cleaned!==true){
    cleanupErrors.push("synthetic database fixture cleanup unconfirmed");
    console.error("CLEANUP REQUIRED: synthetic staging member "+fixture.member_id);
   }else{
    console.log("PASS: cleaned synthetic member and both assignments");
   }
  }
  if(storagePath){
   const removed=await admin.storage.from("member-documents")
    .remove([storagePath]).catch(()=>({error:true}));
   if(removed.error){
    cleanupErrors.push("private synthetic Storage object cleanup unconfirmed");
    console.error("CLEANUP REQUIRED: synthetic private path "+storagePath);
   }else{
    console.log("PASS: cleaned synthetic Storage object");
   }
  }
  await admin.auth.signOut().catch(()=>{});
  await nonadmin.auth.signOut().catch(()=>{});
 }
 if(primaryError) throw primaryError;
 if(cleanupErrors.length)throw Error("staging cleanup incomplete; manual reconciliation required");
 console.log("PASS: positive isolated staging HTTP/Storage/RPC E2E complete; synthetic fixture removed");
}
main().catch(err=>{
 const message=err instanceof Error?err.message:"Unknown error";
 // Messages never contain tokens, passwords, publishable keys, or Auth emails.
 console.error("FAIL: "+message);
 process.exitCode=1;
});
