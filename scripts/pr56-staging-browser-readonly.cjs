#!/usr/bin/env node
/**
 * PR56 isolated staging, read-only browser smoke test.
 *
 * This launches a Next.js dev server on a dedicated localhost port and builds
 * the secure Verification screen with staging-only *public* Supabase values.
 * A real staging Supabase Auth JWT is inserted into the local browser's
 * Supabase storage. This deliberately avoids the app's production-only
 * server-side admin_login_* RPCs; it does not weaken app login code.
 *
 * No member writes, uploads, verification requests, environment changes on
 * Vercel, screenshots, or secrets in diagnostics.
 *
 * Requires operator opt-in, installed optional playwright, and a real staging
 * administrator. Never pass the service-role key to the dev server.
 */
"use strict";
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const REF = "rtptybxugjhvpfjvcvgw";
const STAGING_URL = "https://" + REF + ".supabase.co";
const ORIGIN = "http://127.0.0.1:3197";
const OPT_IN = "I_ACCEPT_READONLY_STAGING_BROWSER_SMOKE";
const env = process.env;
const args = process.argv.slice(2);
const pub = env.PR55_STAGING_PUBLISHABLE_KEY || "";
const email = env.PR55_STAGING_AUTH_EMAIL || "";
const password = env.PR55_STAGING_AUTH_PASSWORD || "";

function refuse(message) {
 console.error("REFUSED: " + message);
 process.exit(2);
}
if (args.length !== 1 || !["--validate-config","--run"].includes(args[0]))
 refuse("use exactly --validate-config or --run");
if (env.PR56_ALLOW_STAGING_BROWSER_SMOKE !== OPT_IN)
 refuse("explicit local, read-only staging browser opt-in is required");
if (!pub.startsWith("sb_publishable_") || !email || !password)
 refuse("a staging publishable key and staging administrator credentials are required");
if (args[0] === "--validate-config") {
 console.log("PASS: staging-only browser configuration accepted; NO network or database requests made");
 process.exit(0);
}

async function ensurePortFree() {
 await new Promise((resolve,reject) => {
  const server = net.createServer();
  server.once("error",() => reject(Error("Dedicated localhost port 3197 is already in use; refusing to attach to it")));
  server.listen(3197,"127.0.0.1",() => {
   server.close(() => resolve());
  });
 });
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }
async function ready(child) {
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){
  if(child.exitCode !== null)throw Error("Local Next.js staging server exited before becoming ready");
  try {
   const response=await fetch(ORIGIN+"/admin/verification?tab=reviews&view=approvals",{
    cache:"no-store",signal:AbortSignal.timeout(3500)
   });
   if(response.status===200 || response.status===307 || response.status===308)return;
  }catch(_error){ /* Next is compiling; never leak response bodies */ }
  await delay(700);
 }
 throw Error("Local staging Next.js server did not become ready in time");
}
async function getCount(client,table,filters) {
 let q=client.from(table).select("id",{count:"exact",head:true});
 if(filters){for(const [k,v] of Object.entries(filters))q=q.eq(k,v);}
 const {count,error}=await q;
 if(error || count===null)throw Error("Cannot check staging baseline for "+table);
 return count;
}
async function run(){
 // Fail before any Auth request if Playwright's optional dependency is missing.
 let chromium;
 try {({chromium}=require("playwright"));} catch(_error) {
  throw Error("Playwright is not installed. Install the pinned optional playwright package first");
 }
 await ensurePortFree();
 const supabase=createClient(STAGING_URL,pub,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 let child=null,browser=null;
 try{
  const auth=await supabase.auth.signInWithPassword({email,password});
  if(auth.error || !auth.data?.session?.access_token)
   throw Error("Staging administrator sign-in failed");
  console.log("PASS: staging administrator authenticated with a real JWT");

  const beforeMembers=await getCount(supabase,"members");
  const beforeAssignments=await getCount(supabase,"member_ministries");
  const pending=await getCount(supabase,"member_ministries",{status:"Pending Verification"});
  if(beforeMembers!==1008 || beforeAssignments!==12 || pending!==12)
   throw Error("Staging inventory changed; refusing browser smoke on unexpected data");
  // All 12 assignments are pending without a recommendation letter.
  const documents=await supabase.from("member_ministries")
   .select("id,document_url").eq("status","Pending Verification").limit(20);
  if(documents.error || documents.data?.length!==12 ||
     documents.data.some(item=>item.document_url!==null))
   throw Error("Read-only browser smoke expects twelve pending ministries without letters");
  console.log("PASS: staging baseline and pending-letter safety preflight");

  // Next.js environment is explicitly pinned to staging. Empty all known
  // server secrets; dev browser smoke needs PUBLIC Auth, not privileged RPCs.
  const nextEnv={...process.env,
   NODE_ENV:"development",
   NEXT_PUBLIC_SUPABASE_URL:STAGING_URL,
   NEXT_PUBLIC_SUPABASE_ANON_KEY:pub,
   NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION:"enabled",
   SUPABASE_SERVICE_ROLE_KEY:"",
   ADMIN_LOCKOUT_HMAC_SECRET:"",
   VERIFICATION_RATE_LIMIT_SECRET:"",
   RESEND_API_KEY:""
  };
  const nextBin=require.resolve("next/dist/bin/next");
  child=spawn(process.execPath,[nextBin,"dev","-p","3197","-H","127.0.0.1"],{
   cwd:path.join(__dirname,".."),env:nextEnv,stdio:["ignore","pipe","pipe"],
   windowsHide:true
  });
  // Drain outputs to prevent a child pipe from filling; don't print logs,
  // which can accidentally contain sensitive local application information.
  child.stdout?.on("data",()=>{});
  child.stderr?.on("data",()=>{});
  await ready(child);
  console.log("PASS: isolated local Next.js server started with staging-only browser config");

  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const storageKey="sb-"+REF+"-auth-token";
  const session=auth.data.session;
  await context.addInitScript(({key,value})=>{
   if(location.origin==="http://127.0.0.1:3197")
    localStorage.setItem(key,JSON.stringify(value));
  },{key:storageKey,value:session});

  const page=await context.newPage();
  const url=ORIGIN+"/admin/verification?tab=reviews&view=approvals";
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  await page.getByRole("heading",{name:"Verify Ministry Assignments"})
   .waitFor({state:"visible",timeout:60000});
  console.log("PASS: secure assignment-level Verification screen rendered");

  const reviews=page.getByRole("button",{name:"Review ministries"});
  const rowCount=await reviews.count();
  if(rowCount<1)throw Error("No pending ministry review rows rendered");
  await reviews.first().click();
  const dialog=page.getByRole("dialog",{name:"Choose ministry assignments to verify"});
  await dialog.waitFor({state:"visible",timeout:12000});
  const toggles=dialog.locator('input[type="checkbox"]');
  const total=await toggles.count();
  if(total<1)throw Error("No ministry-specific selection controls in review dialog");
  for(let i=0;i<total;i++){
   assert.equal(await toggles.nth(i).isChecked(),false,"Selections must start unchecked");
   assert.equal(await toggles.nth(i).isDisabled(),true,"Cannot approve without reviewed letter");
  }
  assert.equal(await dialog.getByRole("button",{name:"Verify 0 selected"}).isDisabled(),true);
  assert.ok((await dialog.getByText("No ministry recommendation letter on file",{
   exact:false
  }).count())>0);
  console.log("PASS: modal opens on desktop with every no-letter approval disabled");

  // Resize to a typical mobile viewport. This is a browser smoke, not a
  // complete visual accessibility or responsive design approval.
  await page.setViewportSize({width:390,height:844});
  await dialog.waitFor({state:"visible",timeout:10000});
  assert.equal(await dialog.getByRole("button",{name:"Verify 0 selected"}).isDisabled(),true);
  console.log("PASS: mobile viewport still exposes the protected review dialog");

  const afterMembers=await getCount(supabase,"members");
  const afterAssignments=await getCount(supabase,"member_ministries");
  assert.equal(afterMembers,beforeMembers);
  assert.equal(afterAssignments,beforeAssignments);
  console.log("PASS: browser smoke did not change member or assignment counts");
  console.log("PASS: isolated staging read-only browser smoke complete");
 }finally{
  if(browser)await browser.close().catch(()=>{});
  if(child){
   child.kill();
   await delay(600);
  }
  try{await supabase.auth.signOut();}catch(_error){}
 }
}
run().catch(_error=>{
 // Raw browser errors may include member names or tokens, so deliberately
 // emit only a generic message and a reference to manual local inspection.
 console.error("FAIL: isolated staging browser smoke failed; inspect local test setup or UI before retrying");
 process.exitCode=1;
});
