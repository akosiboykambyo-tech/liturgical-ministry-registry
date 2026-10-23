const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../lib/registration-intake-validation.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename,"utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const loaded = new Module(filename,module);
loaded.filename = filename; loaded.paths = module.paths;
loaded._compile(compiled,filename);
const { validateRegistrationIntake: validate } = loaded.exports;
const input = {first_name:"Maria",last_name:"Santos",parish:"Sample Parish",ministries:["Ministry of Liturgical Music"]};

test("individual intake accepts complete identity", () => {
  assert.equal(validate(input).valid,true);
});
test("trims repeated whitespace without changing names", () => {
  const r=validate({...input,first_name:"  Maria   Elena  "});
  assert.equal(r.valid,true);
  assert.equal(r.normalized.first_name,"Maria Elena");
});
test("rejects missing first name", () => {
  assert.equal(validate({...input,first_name:" "}).valid,false);
});
test("rejects missing parish", () => {
  assert.equal(validate({...input,parish:" "}).valid,false);
});
test("rejects missing ministries", () => {
  assert.equal(validate({...input,ministries:[]}).valid,false);
});
test("rejects blank entries within a ministry list", () => {
  assert.equal(validate({...input,ministries:["Ministry of Liturgical Music"," "]}).valid,false);
});
test("deduplicates repeated literal ministry values", () => {
  const r=validate({...input,ministries:["Ministry of Liturgical Music","Ministry of Liturgical Music"]});
  assert.equal(r.valid,true);
  assert.equal(r.normalized.ministries.length,1);
});
