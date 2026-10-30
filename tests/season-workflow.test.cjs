const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.join(__dirname,"../lib/season-workflow.ts");
const source = fs.readFileSync(filename,"utf8");
const code = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const loaded = new Module(filename,module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(code,filename);
const {progressForBatch,canApproveBatch,shortenedCoverageEnd,assignmentPublicLabel,eligibleForBulkApprove,safeRepresentativeClaim}=loaded.exports;

test("partial approval excludes Held and leaves batch open",()=>{
  const rows=[
    ...Array.from({length:84},(_,i)=>({id:String(i),claim:"Renewing",outcome:"renewed",held:false})),
    ...Array.from({length:3},(_,i)=>({id:"held-"+i,claim:"Transferred",outcome:"pending",held:true}))
  ];
  const p=progressForBatch(rows);
  assert.equal(p.approved,84);assert.equal(p.held,3);assert.equal(p.total,87);
  assert.equal(p.canBeReviewed,false);
  assert.match(p.display,/84 of 87 approved, 3 held/);
});
test("deferred cases can close a batch without disappearing",()=>{
  const p=progressForBatch([
    {id:"a",claim:"Renewing",outcome:"renewed",held:false},
    {id:"b",claim:"Deceased",outcome:"deferred",held:true}
  ]);
  assert.equal(p.deferred,1);assert.equal(p.canBeReviewed,true);
  assert.equal(p.display,"Reviewed, 1 deferred");
});
test("No response cannot be counted as final without a decision",()=>{
  const p=progressForBatch([{id:"a",claim:"No response",outcome:"pending",held:false}]);
  assert.equal(p.canBeReviewed,false);
});
test("no partial approval without a reviewed letter or recorded owner override",()=>{
  assert.equal(canApproveBatch(false,"",true),false);
  assert.equal(canApproveBatch(false,"short",true),false);
  assert.equal(canApproveBatch(false,"documented exception",true),true);
  assert.equal(canApproveBatch(true,"",false),false);
  assert.equal(canApproveBatch(true,"",true),true);
});
test("coverage is shortened, never extended",()=>{
  assert.equal(shortenedCoverageEnd("2027-06-01","2026-10-30",true),"2026-10-30");
  assert.equal(shortenedCoverageEnd("2026-01-01","2026-10-30",true),"2026-01-01");
  assert.equal(shortenedCoverageEnd("2027-06-01","2026-10-30",false),"2027-06-01");
  assert.equal(shortenedCoverageEnd(null,"2026-10-30",true),null);
});
test("explicit administrative status outranks an expired end date",()=>{
  const today="2026-10-30";
  assert.equal(assignmentPublicLabel({status:"Inactive",expiration_date:"2020-01-01"},today),"Not currently active");
  assert.equal(assignmentPublicLabel({status:"Pending Verification",expiration_date:"2020-01-01"},today),"Pending review");
  assert.equal(assignmentPublicLabel({status:"Renewed",expiration_date:"2020-01-01"},today),"Registration ended");
  assert.equal(assignmentPublicLabel({status:"New",expiration_date:"2027-01-01"},today),"Registered");
  assert.equal(assignmentPublicLabel({status:"New",expiration_date:null},today),"Pending review");
});
test("sensitive claims are accepted only as defined response values",()=>{
  assert.equal(safeRepresentativeClaim("Transferred"),true);
  assert.equal(safeRepresentativeClaim("Deceased"),true);
  assert.equal(safeRepresentativeClaim("inactive"),false);
});
test("bulk approval does not process inactive or held rows",()=>{
  const base={claim:"Renewing",outcome:"pending",held:false,adminStatus:"Renewed"};
  assert.equal(eligibleForBulkApprove(base),true);
  assert.equal(eligibleForBulkApprove({...base,held:true}),false);
  assert.equal(eligibleForBulkApprove({...base,adminStatus:"Inactive"}),false);
  assert.equal(eligibleForBulkApprove({...base,duplicateUnresolved:true}),false);
  assert.equal(eligibleForBulkApprove({...base,claim:"Deceased"}),false);
});
