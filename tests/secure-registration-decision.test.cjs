const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, "../lib", name + ".ts");
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  cache.set(name, m.exports);
  m.require = (request) => request === "./constants"
    ? load("constants")
    : request.startsWith("./")
      ? load(request.slice(2))
      : require(request);
  m._compile(js, filename);
  cache.set(name, m.exports);
  return m.exports;
}
const { prepareSecureIntake } = load("secure-registration-decision");
const { MINISTRIES } = load("constants");
const incoming = {
  source: { kind: "individual", reference: "test-case" },
  first_name: "  Fictional  ", last_name: " Citizen ", parish: " Test Parish ",
  ministries: ["Ministry of Liturgical Music"], service_year: 2026,
  requestKey: "11111111-1111-4111-8111-111111111111",
};
const candidate = { memberId: "old-uid", first_name: "Fictional", last_name: "Citizen", parish: "Test Parish" };
test("unique identity prepares one normalized member", () => {
  const result = prepareSecureIntake(incoming, []);
  assert.equal(result.action, "create");
  assert.equal(result.normalized.first_name, "Fictional");
});
test("exact duplicate routes to manual review", () => {
  const result = prepareSecureIntake(incoming, [candidate]);
  assert.equal(result.action, "review");
  assert.deepEqual(result.candidateMemberIds, ["old-uid"]);
});
test("cross-parish duplicate routes to review", () => {
  assert.equal(prepareSecureIntake(incoming, [{ ...candidate, parish: "Other Parish" }]).action, "review");
});
test("fuzzy first-name match routes to review", () => {
  assert.equal(prepareSecureIntake(incoming, [{ ...candidate, first_name: "Fictioal" }]).action, "review");
});
test("all six ministries are allowed", () => {
  assert.equal(MINISTRIES.length, 6);
  assert.equal(prepareSecureIntake({ ...incoming, ministries: [...MINISTRIES] }, []).normalized.ministries.length, 6);
});
test("Lector alone is not an approved ministry", () => {
  assert.throws(() => prepareSecureIntake({ ...incoming, ministries: ["Lector"] }, []), /Unapproved/);
});
test("invalid idempotency request rejected", () => {
  assert.throws(() => prepareSecureIntake({ ...incoming, requestKey: "not-a-uuid" }, []), /idempotency/);
});
test("bulk intake requires valid source row", () => {
  assert.throws(() => prepareSecureIntake({ ...incoming, source: { kind: "bulk", reference: "batch", row: 0 } }, []), /row reference/);
});
