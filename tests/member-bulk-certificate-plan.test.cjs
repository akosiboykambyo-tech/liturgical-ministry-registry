// Run with: node --test tests/member-bulk-certificate-plan.test.cjs
// Exercise the actual TS planner without requiring a browser or database.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScriptModule(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => {
      if (name in imports) return imports[name];
      throw new Error("Unexpected dependency: " + name);
    },
    mod,
    mod.exports
  );
  return mod.exports;
}

const constants = loadTypeScriptModule("lib/constants.ts");
const {
  buildBulkCertificatePlan, certificatePlanFingerprint, MAX_BULK_CERTIFICATES,
} = loadTypeScriptModule("lib/certificate-batch.ts", { "@/lib/constants": constants });

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
function member(assignments, overrides = {}) {
  return {
    id: "person-1", first_name: "Test", last_name: "Minister",
    uid: "LMD-2026-TEST", parish: "Example Parish", ministries: ["MLC", "MLM"],
    member_ministries: assignments,
    ...overrides,
  };
}
function assignment(ministry, status = "Renewed", daysUntilExpiration = 120, overrides = {}) {
  return {
    id: "assignment-" + ministry,
    member_id: "person-1",
    ministry, status,
    expiration_date: dateOffset(daysUntilExpiration),
    ...overrides,
  };
}

test("prints only the assignment matching the active ministry filter", () => {
  const m = member([assignment("MLC"), assignment("MLM")]);
  const plan = buildBulkCertificatePlan([m], ["MLC"]);
  assert.deepEqual(plan.eligible.map((item) => item.assignment.ministry), ["MLC"]);
  assert.equal(plan.excluded.length, 0);
});

test("multiple active ministry filters produce one page per eligible assignment", () => {
  const m = member([assignment("MLC"), assignment("MLM")]);
  const plan = buildBulkCertificatePlan([m], ["MLC", "MLM"]);
  assert.equal(plan.eligible.length, 2);
});

test("Pending Verification, expired and expiring-soon assignments are excluded", () => {
  const m = member([
    assignment("MLC", "Pending Verification"),
    assignment("MLM", "Renewed", -3),
    assignment("MBG", "New", 10),
    assignment("EMHC", "New", 120),
  ]);
  const plan = buildBulkCertificatePlan([m], ["MLC", "MLM", "MBG", "EMHC"]);
  assert.deepEqual(plan.eligible.map((item) => item.assignment.ministry), ["EMHC"]);
  assert.equal(plan.excluded.length, 3);
});

test("pending UID and mismatched assignment ownership are excluded", () => {
  const pending = member([assignment("MLC")], { uid: "PENDING" });
  const foreign = member([assignment("MLM", "New", 100, { member_id: "someone-else" })]);
  const plan = buildBulkCertificatePlan([pending, foreign], ["MLC", "MLM"]);
  assert.equal(plan.eligible.length, 0);
  assert.equal(plan.excluded.length, 2);
});

test("empty ministry filter never produces a certificate", () => {
  assert.equal(buildBulkCertificatePlan([member([assignment("MLC")])], []).eligible.length, 0);
});

test("duplicate assignment is rendered only once", () => {
  const a = assignment("MLC");
  assert.equal(buildBulkCertificatePlan([member([a, a])], ["MLC"]).eligible.length, 1);
});

test("changes to expiration or member data invalidate a reviewed print plan", () => {
  const before = buildBulkCertificatePlan([member([assignment("MLC")])], ["MLC"]);
  const after = buildBulkCertificatePlan([member([assignment("MLC", "Renewed", 60)])], ["MLC"]);
  assert.notEqual(certificatePlanFingerprint(before), certificatePlanFingerprint(after));
});

test("each PDF has a bounded maximum page count", () => {
  assert.equal(MAX_BULK_CERTIFICATES, 100);
});
