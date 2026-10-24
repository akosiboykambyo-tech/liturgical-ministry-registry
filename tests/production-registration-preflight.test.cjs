const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
function loadTs(rel) {
  const file = path.resolve(__dirname, "..", rel);
  const instance = new Module(file, module);
  instance.filename = file;
  instance._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }}).outputText, file);
  return instance.exports;
}
const { preflightRegistrationAdministrator: check } = loadTs("lib/production-registration-preflight.ts");
const id = "11111111-1111-4111-8111-111111111111";
const token = "test-bearer-token";
const auth = (user=id, error=null) => ({ auth: { getUser: async jwt => { assert.equal(jwt, token); return { data: { user: user ? { id: user } : null }, error }; } } });
const role = (data=true, error=null) => ({ rpc: async name => { assert.equal(name, "registration_is_admin"); return { data, error }; } });
test("valid verified administrator passes preflight", async () => assert.deepEqual(await check(token,auth(),role(),"true",true),{authorized:true}));
test("disabled feature rejects without calling external services", async () => assert.equal((await check(token,null,null,undefined,true)).reason,"disabled"));
test("empty token fails closed", async () => assert.equal((await check("",auth(),role(),"true",true)).reason,"unauthenticated"));
test("auth failures reject", async () => assert.equal((await check(token,auth(null,Error("unauthorized")),role(),"true",true)).reason,"unauthenticated"));
test("role false rejects", async () => assert.equal((await check(token,auth(),role(false),"true",true)).reason,"forbidden"));
test("role RPC failure rejects", async () => assert.equal((await check(token,auth(),role(null,Error("offline")),"true",true)).reason,"forbidden"));
test("schema missing stops before RPC", async () => assert.equal((await check(token,auth(),null,"true",false)).reason,"schema_unready"));
test("invalid UID rejected", async () => assert.equal((await check(token,auth("not-a-uuid"),role(),"true",true)).reason,"unauthenticated"));
