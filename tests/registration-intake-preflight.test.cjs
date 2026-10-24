const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
function loadTs(name) {
  const filename = path.resolve(__dirname, "../lib", name);
  const js = ts.transpileModule(fs.readFileSync(filename,"utf8"), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020 }
  }).outputText;
  const m = new Module(filename,module);
  m.filename = filename;
  m.paths = module.paths;
  m.require = (request) => request === "./registration-matching"
    ? loadTs("registration-matching.ts") : request === "./registration-intake-validation"
    ? loadTs("registration-intake-validation.ts") : require(request);
  m._compile(js,filename);
  return m.exports;
}
const { preflightBatchIntake: check } = loadTs("registration-intake-preflight.ts");
const row = (first_name,last_name,parish="Sample A",ministry="Ministry of Liturgical Music") =>
  ({first_name,last_name,parish,ministry});
test("independent people remain standalone", () => {
  const r=check([row("Maria","Santos"),row("Pedro","Reyes")]);
  assert.deepEqual(r.standaloneRows,[1,2]);
  assert.deepEqual(r.reviewRows,[]);
});
test("repeated person and same ministry requires review, not auto-create", () => {
  const r=check([row("Maria","Santos"),row("Maria","Santos")]);
  assert.deepEqual(r.reviewRows,[1,2]);
  assert.equal(r.conflicts[0].match,"exact");
});
test("same exact name and parish with a different ministry still requires identity verification", () => {
  const r=check([row("Maria","Santos"),row("Maria","Santos","Sample A","Ministry of Lectors and Commentators")]);
  assert.equal(r.conflicts[0].match,"exact");
});
test("same name across parishes requires review", () => {
  const r=check([row("Maria","Santos"),row("Maria","Santos","Sample B")]);
  assert.equal(r.conflicts[0].match,"same_name_different_parish");
});
test("likely typo needs manual review", () => {
  const r=check([row("Jonathan","Santos"),row("Jonatan","Santos")]);
  assert.equal(r.conflicts[0].match,"similar_name");
});
test("invalid rows are isolated and never standalone", () => {
  const r=check([row("","Santos"),row("Pedro","Reyes")]);
  assert.deepEqual(r.invalid.map(x=>x.row),[1]);
  assert.deepEqual(r.standaloneRows,[2]);
});
test("numeric suffixes remain distinguishable", () => {
  const r=check([row("Subject 3","Reyes"),row("Subject 4","Reyes")]);
  assert.deepEqual(r.standaloneRows,[1,2]);
});
test("all members in a multiple-match cluster enter review", () => {
  const r=check([row("Maria","Santos"),row("MARIA","SANTOS"),row("Maria","Santos"),row("Pedro","Reyes")]);
  assert.deepEqual(r.reviewRows,[1,2,3]);
  assert.deepEqual(r.standaloneRows,[4]);
  assert.equal(r.conflicts.length,3);
});
