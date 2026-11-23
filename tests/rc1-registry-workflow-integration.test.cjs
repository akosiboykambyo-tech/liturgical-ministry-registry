"use strict";
// Actual RC1 Registry TypeScript functions, executed with synthetic PostgREST
// response fixtures and an instrumented guarded-write boundary.
// No Supabase credentials or network calls are used; this tests the real
// import/duplicate/pagination/CSV orchestration, NOT the live DB invariant.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(file, mocked = {}) {
  const filename = path.resolve(__dirname, "../", file);
  const source = ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText;
  const m = new Module(filename,module);
  m.filename=filename;
  m.paths=module.paths;
  m.require = name => mocked[name] || require(name);
  m._compile(source,filename);
  return m.exports;
}
const realMatching=loadTs("lib/registration-matching.ts");
const ministry="Ministry of Liturgical Music";
const parish="Synthetic Parish A";
const person=(first_name,last_name,at=parish,i="existing-1")=>({
  id:i,uid:"QA-"+i,first_name,last_name,parish:at,ministries:[ministry],
  status:"Pending Verification"
});
const intake=(first_name="Jonathan",last_name="Santos",at=parish)=>({
 first_name,last_name,parish:at,ministries:[ministry],service_year:2026
});
const csv=(first_name,last_name,at=parish,m=ministry)=>({
 first_name,last_name,parish:at,ministry:m
});

function createHarness(options={}){
 const calls={queries:[],writes:[],direct:0};
 const stored=[...(options.members||[])];
 const ministries=[...(options.assignments||[])];
 const history=options.history||null;
 function clientQuery(table){
  const config={table,mode:"select",filters:{},from:0,to:999};
  const query={
   select(){return query;},
   ilike(k,v){config.filters[k]=String(v);return query;},
   not(k,_op,v){config.filters.excludeParish=String(v);return query;},
   range(a,b){config.mode="range";config.from=a;config.to=b;return query;},
   eq(k,v){config.filters[k]=v;return query;},
   maybeSingle:async()=>({
    data:history,
    error:options.fail==="history"?{message:"Synthetic history outage"}:null
   }),
   insert(){calls.direct++;throw Error("Forbidden direct write");},
   update(){calls.direct++;throw Error("Forbidden direct write");},
   delete(){calls.direct++;throw Error("Forbidden direct write");},
   then(resolve,reject){
     calls.queries.push({...config,filters:{...config.filters}});
     let result;
     let data=table==="members"?stored:table==="member_ministries"?ministries:[];
     if(config.mode==="range")data=data.slice(config.from,config.to+1);
     else if(table==="members"){
       for(const k of ["first_name","last_name","parish"]){
         if(k in config.filters)data=data.filter(x=>
           String(x[k]).toLowerCase()===config.filters[k].toLowerCase());
       }
       if(config.filters.excludeParish!==undefined)data=data.filter(x=>
         x.parish.toLowerCase()!==config.filters.excludeParish.toLowerCase());
     }
     const broken=(
       (options.fail==="exact"&&table==="members"&&config.mode!=="range"&&config.filters.parish!==undefined)||
       (options.fail==="parish"&&table==="members"&&config.mode!=="range"&&config.filters.excludeParish!==undefined)||
       (options.fail==="page0"&&table==="members"&&config.mode==="range"&&config.from===0)||
       (options.fail==="page1"&&table==="members"&&config.mode==="range"&&config.from===1000)||
       (options.fail==="ministries-page0"&&table==="member_ministries"&&config.mode==="range"&&config.from===0)
     );
     if(broken){
       result={data:null,error:options.nullResponse?null:{message:"Synthetic read failure"}};
     } else result={data,error:null};
     return Promise.resolve(result).then(resolve,reject);
   }
  };
  return query;
 }
 const client={from:clientQuery};
 const write=async (action,data)=>{
   calls.writes.push({action,data});
   if(options.failWrite===action)throw Error("Synthetic guarded RPC failure");
   if(action==="flag_duplicate")return{id:"synthetic-flag"};
   if(action==="create")return{
      member:person(data.first_name,data.last_name,data.parish,"created-1")
   };
   if(action==="create_batch")return {
     rows:options.invalidBatch?[]:data.rows.map(()=>({status:"created"}))
   };
   if(action==="import_begin")return{id:"synthetic-batch"};
   if(action==="import_finish")return{success:true};
   throw Error("Unexpected guarded write action: "+action);
 };
 const api=loadTs("lib/duplicate-check.ts",{
   "@/lib/supabase/client":{getSupabaseBrowserClient:()=>client},
   "@/lib/registry-admin-writes":{registryAdminWrite:write},
   "@/lib/constants":{MINISTRIES:[ministry,"Ministry of Lectors and Commentators"],shortMinistry:s=>s},
   "@/lib/registration-matching":realMatching
 });
 return {api,calls};
}
function guardNoMemberWrite(calls){
 assert.equal(calls.direct,0,"Direct PostgREST mutations are forbidden");
 assert.equal(calls.writes.filter(x=>x.action==="create"||x.action==="create_batch").length,0,
   "Failed/duplicate operation attempted a member write");
}
test("Add Member unique entry uses one guarded create RPC",async()=>{
 const {api,calls}=createHarness();
 const result=await api.importSingleMember(intake());
 assert.equal(result.status,"created");
 assert.equal(result.member.first_name,"Jonathan");
 assert.deepEqual(calls.writes.map(x=>x.action),["create"]);
 assert.equal(calls.writes[0].data.service_year,2026);
 assert.equal(calls.direct,0);
});
for(const scenario of [
 {name:"exact same-parish",existing:person("Jonathan","Santos"),type:"exact"},
 {name:"same name different parish",existing:person("Jonathan","Santos","Synthetic Parish B"),type:"same_name_different_parish"},
 {name:"similar name",existing:person("Jonatan","Santos"),type:"similar_name"}
]){
 test("Add Member sends "+scenario.name+" to review, never creates member",async()=>{
   const {api,calls}=createHarness({members:[scenario.existing]});
   const result=await api.importSingleMember(intake());
   assert.equal(result.status,"duplicate");
   assert.equal(result.matchType,scenario.type);
   assert.deepEqual(calls.writes.map(x=>x.action),["flag_duplicate"]);
   guardNoMemberWrite(calls);
 });
}
test("1,001-member Registry: last-page fuzzy duplicate is detected, no create",async()=>{
 const db=Array.from({length:1000},(_,i)=>person("Fixture"+i,"Tester"+i,parish,"member-"+i));
 db.push(person("Jonatan","Santos",parish,"last-record-1001"));
 const {api,calls}=createHarness({members:db});
 const response=await api.importSingleMember(intake());
 assert.equal(response.status,"duplicate");
 assert.equal(response.existing.id,"last-record-1001");
 assert.equal(response.matchType,"similar_name");
 assert.deepEqual(calls.queries.filter(x=>x.table==="members"&&x.mode==="range").map(x=>x.from),[0,1000]);
 guardNoMemberWrite(calls);
});
for(const failure of ["exact","parish","page0","page1"]){
 for(const nullResponse of [false,true]){
 test("Add Member "+failure+" "+(nullResponse?"null response":"query error")+" fails closed before any writes",async()=>{
  const db=failure==="page1"?Array.from({length:1001},(_,i)=>person("Fixture"+i,"Tester"+i,parish,"fixture-"+i)):[];
  const {api,calls}=createHarness({members:db,fail:failure,nullResponse});
  const result=await api.importSingleMember(intake());
  assert.equal(result.status,"error");
  assert.match(result.error,/not saved/i);
  assert.deepEqual(calls.writes,[],"No review flag writes on incomplete scans either");
  assert.equal(calls.direct,0);
  if(failure==="page1")assert.deepEqual(calls.queries.filter(x=>x.mode==="range").map(x=>x.from),[0,1000]);
 });
 }
}
test("CSV stages exact/cross-parish/fuzzy duplicates and two-ministry consolidation",async()=>{
 const db=[person("Jonathan","Santos")];
 const {api,calls}=createHarness({members:db});
 const rows=[
  csv("Jonathan","Santos"),csv("Jonathan","Santos",parish,"Ministry of Lectors and Commentators"),
  csv("Rogelio","Dizon"),csv("Rogelio","Dizon",parish,"Ministry of Lectors and Commentators"),
  csv("Rogelio","Dizon","Synthetic Parish B"),csv("Jonatan","Santos"),
  csv("Rogelio","Dizon")
 ];
 const result=await api.stageBatchRecords(rows,undefined,2026);
 assert.equal(result.unique.length,1);
 assert.deepEqual(result.unique[0].ministries.sort(),[ministry,"Ministry of Lectors and Commentators"].sort());
 assert.ok(result.duplicates.some(d=>d.matchType==="exact"));
 assert.ok(result.duplicates.some(d=>d.matchType==="internal_batch_fuzzy"));
 assert.ok(result.duplicates.some(d=>d.matchType==="similar_name"));
 assert.deepEqual(calls.writes,[]);
 assert.equal(calls.direct,0);
});
test("CSV staging checks 1,001st member and avoids premature RPC",async()=>{
 const db=Array.from({length:1000},(_,i)=>person("Fixture"+i,"Tester"+i,parish,"row-"+i));
 db.push(person("Jonathan","Santos",parish,"last-1001"));
 const {api,calls}=createHarness({members:db});
 const result=await api.stageBatchRecords([csv("Jonathan","Santos")],"new-import-hash",2026);
 assert.equal(result.unique.length,0);
 assert.equal(result.duplicates[0].existing.id,"last-1001");
 assert.deepEqual(calls.queries.filter(x=>x.table==="members"&&x.mode==="range").map(x=>x.from),[0,1000]);
 assert.deepEqual(calls.writes,[]);
});
for(const fail of ["history","page0","page1"]){
 test("CSV "+fail+" failure aborts before any guarded write",async()=>{
  const db=fail==="page1"?Array.from({length:1000},(_,i)=>person("Fixture"+i,"Tester"+i,parish,"row-"+i)):[];
  const {api,calls}=createHarness({members:db,fail});
  await assert.rejects(
   api.stageBatchRecords([csv("Newname","Surname")],"hash-"+fail,2026),
   /(?:history|Synthetic read failure)/i
  );
  assert.deepEqual(calls.writes,[]);
  assert.equal(calls.direct,0);
 });
}
test("CSV idempotency surfaces previous import before any write",async()=>{
 const prior={id:"batch-id",file_name:"synthetic.csv",created_at:"2026-11-22T00:00:00Z",unique_inserted:4,duplicates_routed:1,status:"done"};
 const {api,calls}=createHarness({history:prior});
 const result=await api.stageBatchRecords([csv("Newname","Surname")],"already-imported-hash",2026);
 assert.equal(result.alreadyImported.batchId,"batch-id");
 assert.equal(result.alreadyImported.uniqueInserted,4);
 assert.deepEqual(calls.writes,[]);
});
test("CSV guarded batch creation uses 100-row RPC chunks and precise indices",async()=>{
 const {api,calls}=createHarness();
 const members=Array.from({length:230},(_,i)=>intake("Unique"+i,"Example"+i));
 const out=await api.importMemberBatch(members,45);
 assert.equal(out.length,230);
 assert.equal(out[0].index,45);
 assert.equal(out[229].index,274);
 assert.ok(out.every(x=>x.status==="created"));
 assert.deepEqual(calls.writes.map(x=>x.action),["create_batch","create_batch","create_batch"]);
 assert.deepEqual(calls.writes.map(x=>x.data.rows.length),[100,100,30]);
 assert.equal(calls.direct,0);
});
test("CSV invalid server batch response is reported as errors without direct retries",async()=>{
 const {api,calls}=createHarness({invalidBatch:true});
 const out=await api.importMemberBatch([intake()],0);
 assert.deepEqual(out.map(x=>x.status),["error"]);
 assert.match(out[0].error,/incomplete/i);
 assert.deepEqual(calls.writes.map(x=>x.action),["create_batch"]);
 assert.equal(calls.direct,0);
});
test("CSV staged unique entries can traverse guarded batch RPC only after successful staging",async()=>{
 const {api,calls}=createHarness();
 const staged=await api.stageBatchRecords([csv("Newname","Surname")],"fixture-hash",2026);
 assert.equal(staged.unique.length,1);
 assert.equal(calls.writes.length,0);
 const result=await api.importMemberBatch(staged.unique,0);
 assert.equal(result[0].status,"created");
 assert.deepEqual(calls.writes.map(x=>x.action),["create_batch"]);
 assert.equal(calls.direct,0);
});
