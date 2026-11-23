// COWL-DOK RC1: actual Next.js Add Member + CSV browser acceptance.
// ALL DB/Auth requests target loopback Supabase CLI. Registry write RPCs are
// intercepted, counted, and never sent to a database. No remote credentials.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {spawnSync}=require("node:child_process");
const {chromium}=require(process.env.RC1_PLAYWRIGHT_MODULE);
const raw=fs.readFileSync(process.env.RC1_LOCAL_ENV,"utf8");
const vars=Object.fromEntries(raw.split(/\r?\n/).filter(x=>/^[A-Z_]+=/u.test(x)).map(x=>{
 const i=x.indexOf("=");return[x.slice(0,i),x.slice(i+1).replace(/^["']|["']$/g,"")];
}));
const host="http://127.0.0.1:3499";
assert.ok(vars.API_URL?.startsWith("http://127.0.0.1:"),"Supabase must be loopback");
assert.ok(vars.DB_URL?.startsWith("postgresql://"),"DB must be local URL");
assert.ok(vars.ANON_KEY,"Local publishable key missing");
const db=new URL(vars.DB_URL);
assert.equal(db.hostname,"127.0.0.1");
function sql(query){
 const result=spawnSync("psql",["-X","-v","ON_ERROR_STOP=1","-h",db.hostname,"-p",db.port,"-U",db.username,"-d",db.pathname.slice(1),"-c",query],{
  env:{...process.env,PGPASSWORD:decodeURIComponent(db.password)},encoding:"utf8"
 });
 assert.equal(result.status,0,"Synthetic local SQL failed");
}
async function authRequest(endpoint,body){
 const response=await fetch(vars.API_URL+endpoint,{
 method:"POST",headers:{apikey:vars.ANON_KEY,"content-type":"application/json"},
 body:JSON.stringify(body)});
 const data=await response.json();
 assert.ok(response.ok,"Local Auth call failed, HTTP "+response.status);
 return data;
}
const email="registry-browser@rc1-local-only.invalid";
const password="SyntheticOnly_RC1-7!2Jkq";
const signed=await authRequest("/auth/v1/signup",{email,password});
assert.ok(signed.user?.id,"Local GoTrue user missing");
const tokens=await authRequest("/auth/v1/token?grant_type=password",{email,password});
assert.ok(tokens.access_token&&tokens.refresh_token,"Local GoTrue sign-in missing tokens");
assert.match(signed.user.id,/^[0-9a-f-]{36}$/i);
sql("INSERT INTO registry_private.registration_administrators(user_id,active,revoked_at) VALUES ('"+signed.user.id+"',true,NULL)");
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
let writes=[];
let page;
const parish="San Lorenzo & Companion Martyrs Parish";
const ministry="Ministry of Liturgical Music";
const seenRanges=[];
async function fillMember(first,last){
 await page.locator("#firstName").fill(first);
 await page.locator("#lastName").fill(last);
 await page.getByRole("button",{name:"Custom",exact:true}).click();
 await page.locator("#customParish").fill(parish);
 await page.getByLabel(ministry,{exact:true}).check();
}
async function visitAddMember(){
 await page.goto(host+"/admin/members/add",{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:"Add Member"}).waitFor({timeout:45000});
}
async function verifyNoActualSqlWrites(){
 const q="SELECT count(*) AS n FROM public.members";
 const result=spawnSync("psql",["-X","-t","-A","-v","ON_ERROR_STOP=1","-h",db.hostname,"-p",db.port,"-U",db.username,"-d",db.pathname.slice(1),"-c",q],{
 env:{...process.env,PGPASSWORD:decodeURIComponent(db.password)},encoding:"utf8"});
 assert.equal(result.status,0);
 assert.equal(Number(result.stdout.trim()),1001,"Synthetic Registry must remain untouched");
}
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});
 page.on("request",req=>{
  if(req.url().includes("/rest/v1/members")&&!req.url().includes("member_ministries")){
   seenRanges.push({range:req.headers()["range"]||"",url:req.url().slice(0,150)});
  }
 });
 await page.route("**/api/admin/sign-in",route=>{
  assert.equal(route.request().method(),"POST");
  return route.fulfill({status:200,contentType:"application/json",
   body:JSON.stringify({access_token:tokens.access_token,refresh_token:tokens.refresh_token})});
 });
 await page.route("**/rest/v1/rpc/registry_admin_member_write_v1",async route=>{
  assert.equal(route.request().method(),"POST");
  const body=JSON.parse(route.request().postData()||"{}");
  writes.push(body);
  let reply;
  if(body.p_action==="flag_duplicate")reply={id:"synthetic-review-1"};
  else if(body.p_action==="create")reply={member:{
    id:"00000000-0000-0000-0000-000000000099",uid:"SYNTHETIC-NOT-WRITTEN",
    first_name:body.p_data.first_name,last_name:body.p_data.last_name,
    parish:body.p_data.parish,ministries:body.p_data.ministries,
    status:"Pending Verification"
  }};
  else throw Error("Browser attempted unexpected privileged action "+body.p_action);
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(reply)});
 });
 await page.goto(host+"/admin",{waitUntil:"domcontentloaded"});
 await page.locator("#admin-email").fill(email);
 await page.locator("#admin-password").fill(password);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await page.waitForURL("**/admin/dashboard",{timeout:60000});
 console.log("PASS: actual Registry browser login with local GoTrue tokens");
 await visitAddMember();
 await fillMember("Jonathan","Santos"); // synthetic fuzzy match in row 1001
 await page.getByRole("button",{name:"Save Member"}).click();
 await page.getByText("Possible duplicate detected").waitFor({timeout:30000});
 assert.deepEqual(writes.map(x=>x.p_action),["flag_duplicate"]);
 assert.ok(seenRanges.some(x=>/1000/.test(x.range)||/1000/.test(x.url)),
  "Browser did not request the second page");
 console.log("PASS: Add Member browser detects fuzzy duplicate on 1,001st row, flags review without create");
 await verifyNoActualSqlWrites();
 await visitAddMember();
 writes=[];
 await fillMember("Novel","Registryfixture");
 await page.getByRole("button",{name:"Save Member"}).click();
 await page.getByRole("status").getByText(/Created Novel Registryfixture/).waitFor({timeout:30000});
 assert.deepEqual(writes.map(x=>x.p_action),["create"]);
 await verifyNoActualSqlWrites();
 console.log("PASS: Add Member form submits one guarded create RPC and shows confirmation (RPC intercepted)");
 await visitAddMember();
 writes=[];
 await fillMember("Uniqueerror","Check");
 let injected=0;
 await page.route("**/rest/v1/members**",async route=>{
  if(route.request().method()==="GET"){
   injected++;
   return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Synthetic DB outage"})});
  }
  await route.continue();
 });
 await page.getByRole("button",{name:"Save Member"}).click();
 await page.getByRole("alert").getByText(/not saved because duplicate validation/i).waitFor({timeout:30000});
 assert.ok(injected>0);
 assert.equal(writes.length,0,"Failed duplicate check must prevent all Registry writes");
 assert.equal(await page.getByRole("button",{name:"Save Member"}).isEnabled(),true,"Controls remained blocked");
 await page.unroute("**/rest/v1/members**");
 console.log("PASS: Add Member browser read-error fails closed; no writes; control resets");
 await verifyNoActualSqlWrites();
 await page.goto(host+"/admin/verification?tab=submissions&type=new&mode=intake",{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:"New Registration"}).waitFor({timeout:40000});
 const fileInput=page.locator('input[type="file"][accept=".csv"]').first();
 await fileInput.setInputFiles({name:"synthetic-registration.csv",mimeType:"text/csv",
  buffer:Buffer.from("First Name,Last Name,Parish,Ministry\nCsvsynthetic,Applicant,"+parish+","+ministry+"\n")});
 await page.getByText("1 valid row(s) ready to stage").waitFor({timeout:30000});
 await page.locator('input[type="checkbox"]').filter({has:page.locator("none")}).count(); // no-op
 const confirmation=page.getByText(/I understand that this action creates Pending Verification/);
 await confirmation.click();
 writes=[];
 let csvOutage=0;
 await page.route("**/rest/v1/members**",async route=>{
  if(route.request().method()==="GET"){
   const range=route.request().headers()["range"]||"";
   if(range.startsWith("1000-")){
    csvOutage++;
    return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Synthetic second-page outage"})});
   }
  }
  return route.continue();
 });
 await page.getByRole("button",{name:/Import 1 Members/}).click();
 await page.getByText(/Import stopped before member creation/).waitFor({timeout:30000});
 assert.ok(csvOutage>0,"CSV did not exercise second-page outage");
 assert.equal(writes.length,0,"CSV staging error triggered a write");
 assert.equal(await page.getByRole("button",{name:/Import 1 Members/}).isEnabled(),true,"Import button must reset");
 await page.unroute("**/rest/v1/members**");
 await verifyNoActualSqlWrites();
 console.log("PASS: actual CSV browser staging fails closed on page two, no RPC writes, submit button resets");
 console.log("FINAL: PASS RC1 real UI with synthetic local Auth, real PostgREST reads and intercepted writes");
}catch(error){
 console.error("RC1 BROWSER QA FAILED: "+String(error?.message||error));
 if(page){
  try{const body=(await page.locator("body").innerText({timeout:3000})).slice(0,700);
   console.error("Visible UI excerpt (synthetic only): "+body.replace(/\s+/g," "));}catch{}
 }
 process.exitCode=1;
}finally{await browser.close();}
