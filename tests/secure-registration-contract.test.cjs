const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const cache = new Map();
function load(name) {
  if(cache.has(name)) return cache.get(name);
  const file = path.resolve(__dirname, "../lib", name + ".ts");
  const m = new Module(file,module); m.filename=file; cache.set(name,m.exports);
  m.require = r => r === "./constants" ? load("constants") : r.startsWith("./") ? load(r.slice(2)) : require(r);
  const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  m._compile(js,file);cache.set(name,m.exports);return m.exports;
}
const {parseSecureRegistrationRequest:parse,normalizeAtomicRegistrationResponse:normalize}=load("secure-registration-contract");
const base={
 source:{kind:"individual",reference:"case-1"}, first_name:" Zephyra ",last_name:" Uniqueplume ",parish:"Training Parish",
 ministries:["Ministry of Liturgical Music"],service_year:2026,requestKey:"11111111-1111-4111-8111-111111111111"
};
test("normalizes valid structured body",()=>assert.equal(parse(base).first_name,"Zephyra"));
test("rejects client-provided candidate array in place of ministry names",()=>assert.throws(()=>parse({...base,ministries:[{}]})));
test("rejects non-approved ministry",()=>assert.throws(()=>parse({...base,ministries:["Lector"]})));
test("rejects invalid source",()=>assert.throws(()=>parse({...base,source:{kind:"bulk",reference:"batch",row:0}})));
test("rejects incorrect request shape",()=>assert.throws(()=>parse(null)));
test("accepts valid atomic create result",()=>assert.deepEqual(normalize({status:"created",member_id:"22222222-2222-4222-8222-222222222222"}),{status:"created",memberId:"22222222-2222-4222-8222-222222222222"}));
test("rejects RPC success without verified member UUID",()=>assert.throws(()=>normalize({status:"created",member_id:"not-uuid"})));
test("accepts explicit review without creating member",()=>assert.deepEqual(normalize({status:"review",candidates:2}),{status:"review",candidates:2}));
test("rejects malformed review count",()=>assert.throws(()=>normalize({status:"review",candidates:0})));
