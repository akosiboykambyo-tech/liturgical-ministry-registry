const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(filename) {
  const full = path.resolve(__dirname, "../lib", filename);
  const compiled = ts.transpileModule(fs.readFileSync(full, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(full, module);
  m.filename = full;
  m.paths = module.paths;
  m.require = (request) => request === "./constants" ? loadTs("constants.ts") : require(request);
  m._compile(compiled, full);
  return m.exports;
}
const { normalizeApprovedMinistries: normalize } = loadTs("registration-ministry-validation.ts");
test("accepts canonical approved ministries", () => {
  assert.deepEqual(normalize(["Ministry of Liturgical Music"]), {
    valid: true, ministries: ["Ministry of Liturgical Music"],
  });
});
test("accepts approved short code and expands to canonical label", () => {
  assert.deepEqual(normalize(["MLC"]), {
    valid: true, ministries: ["Ministry of Lectors and Commentators"],
  });
});
test("normalizes whitespace and letter case", () => {
  const result = normalize(["  ministry of   altar servers  "]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.ministries, ["Ministry of Altar Servers"]);
});
test("deduplicates aliases for the same ministry", () => {
  const result = normalize(["MLM", "Ministry of Liturgical Music"]);
  assert.equal(result.valid, true);
  assert.equal(result.ministries.length, 1);
});
test("rejects unapproved standalone lector label", () => {
  const result = normalize(["Lector"]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.unknown, ["Lector"]);
});
test("rejects unknown values rather than generating Other labels", () => {
  const result = normalize(["Unknown Ministry"]);
  assert.equal(result.valid, false);
});
test("rejects entire request when even one assignment is unknown", () => {
  const result = normalize(["MGC", "Unknown Ministry"]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.unknown, ["Unknown Ministry"]);
});
test("rejects empty and blank ministry lists", () => {
  assert.equal(normalize([]).valid, false);
  assert.equal(normalize([" "]).valid, false);
});
