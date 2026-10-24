const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const base=process.env.PR54_HTTP_BASE_URL;
const project=process.env.PRODUCTION_REGISTRATION_STAGING_PROJECT;
const jwt=process.env.PR54_HTTP_ACCESS_TOKEN;
if(process.env.PR54_ALLOW_TEST_WRITES!=="I_ACCEPT_TEST_DATABASE_WRITES"||
 project!=="rtptybxugjhvpfjvcvgw"||!/^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]+$/.test(base||"")||!jwt){
 console.error("REFUSED: explicit isolated project, local server, token and write opt-in required.");
 process.exit(2);
}
const url=base+"/api/admin/production-registration-staging";
async function post(payload,token=jwt) {
 const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify(payload)});
 const raw=await res.text();
 let json;
 try {json=JSON.parse(raw);} catch {
   throw new Error("Non-JSON response: HTTP "+res.status+
     " content-type="+(res.headers.get("content-type")||"unknown")+
     " path="+new URL(res.url).pathname+
     " body="+raw.slice(0,180).replace(/\\s+/g," "));
 }
 return {http:res.status,json};
}
async function run() {
 const suffix=randomUUID().replace(/-/g,"").slice(0,10);
 const payload={requestKey:randomUUID(),first_name:"PRF"+suffix,last_name:"Synthetic"+suffix,parish:"Synthetic Parish",ministries:["Mother Butler Guild","Ministry of Lectors and Commentators"],service_year:2026};
 const bad=await post(payload,"definitely.invalid.jwt");
 assert.equal(bad.http,401,JSON.stringify(bad));
 const pair=await Promise.all([post(payload),post(payload)]);
 assert.deepEqual(pair.map(x=>x.json.status).sort(),["created","replayed"],JSON.stringify(pair));
 assert.equal(pair[0].json.memberId,pair[1].json.memberId);
 const conflict=await post({...payload,parish:"Different Synthetic Parish"});
 assert.equal(conflict.http,409,JSON.stringify(conflict));
 const duplicate=await post({...payload,requestKey:randomUUID(),parish:"Different Synthetic Parish"});
 assert.equal(duplicate.json.status,"review",JSON.stringify(duplicate));
 assert.ok(duplicate.json.reviewId);
 const race={...payload,requestKey:randomUUID(),first_name:"PRA"+suffix,last_name:"Race"+suffix};
 const raced=await Promise.all([post(race),post({...race,requestKey:randomUUID()})]);
 assert.deepEqual(raced.map(x=>x.json.status).sort(),["created","review"],JSON.stringify(raced));
 console.log("PASS: invalid token, replay, idempotency conflict, duplicate review, distinct-key race");
 console.log("Synthetic fixture label:",suffix);
}
run().catch(e=>{console.error("FAIL:",e.message);process.exitCode=1;});