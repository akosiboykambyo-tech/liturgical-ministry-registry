const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../lib/duplicate-review-plan.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(compiled, filename);
const { planDuplicateReview: plan } = loaded.exports;

const existing = {
  id: "member-1", uid: "UID-TEST", parish: "Parish A",
  ministries: ["Ministry of Lectors and Commentators"],
};
const incoming = {
  parish: "Parish A",
  ministries: ["Ministry of Lectors and Commentators", "Ministry of Liturgical Music"],
};
const base = (decision, overrides = {}) => ({
  decision, incoming, existing, notes: "Reviewed identity and documents.", ...overrides,
});

test("same person preserves UID and adds only missing ministry", () => {
  assert.deepEqual(plan(base("use_existing")), {
    valid: true,
    plan: { kind: "attach_assignments", memberId: "member-1", uid: "UID-TEST", newMinistries: ["Ministry of Liturgical Music"] },
  });
});
test("same ministry repeated does not request duplicate assignment", () => {
  const result = plan(base("use_existing", { incoming: { parish: "Parish A", ministries: ["ministry of lectors and commentators"] } }));
  assert.equal(result.valid, true);
  assert.deepEqual(result.plan.newMinistries, []);
});
test("different parish cannot be silently attached", () => {
  const result = plan(base("use_existing", { incoming: { ...incoming, parish: "Parish B" } }));
  assert.equal(result.valid, false);
});
test("explicit parish transfer preserves UID and records both parishes", () => {
  const result = plan(base("transfer_parish", { incoming: { ...incoming, parish: "Parish B" } }));
  assert.equal(result.valid, true);
  assert.equal(result.plan.uid, "UID-TEST");
  assert.equal(result.plan.fromParish, "Parish A");
  assert.equal(result.plan.toParish, "Parish B");
});
test("new distinct identity starts pending without choosing a UID", () => {
  assert.deepEqual(plan(base("create_distinct")), {
    valid: true, plan: { kind: "new_identity", status: "Pending Verification" },
  });
});
test("discard never writes an assignment", () => {
  assert.deepEqual(plan(base("discard")), { valid: true, plan: { kind: "discard" } });
});
test("missing review notes are rejected", () => {
  assert.equal(plan(base("discard", { notes: "short" })).valid, false);
});
test("missing existing member is rejected for attach decisions", () => {
  assert.equal(plan(base("use_existing", { existing: null })).valid, false);
});
test("invalid incoming ministry list is rejected", () => {
  assert.equal(plan(base("create_distinct", { incoming: { parish: "Parish A", ministries: [] } })).valid, false);
});
