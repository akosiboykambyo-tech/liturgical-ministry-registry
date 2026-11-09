// Run: node --test tests/financial-access-model.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../lib/financial-stewardship/access-model.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const {
  calculateFinanceAccess, financeHome, financePath,
  financeRolesLabel, isFinancialRoleCode,
} = mod.exports;

test("a registry reviewer or platform provisioner never automatically receives finance access", () => {
  const a = calculateFinanceAccess(["cowl_registry_reviewer", "platform_provisioner"]);
  assert.deepEqual(a, { cowl: [], curia: [] });
  assert.equal(financeHome(a), null);
});

test("a COWL verifier sees Collections but not receipt stock or Curia acknowledgment", () => {
  const a = calculateFinanceAccess(["cowl_finance_verifier"]);
  assert.deepEqual(a, { cowl: ["collections"], curia: [] });
  assert.equal(financeHome(a), "/financial-stewardship/collections");
});

test("a COWL remittance preparer can prepare remittances but cannot enter Curia", () => {
  const a = calculateFinanceAccess(["cowl_remittance_preparer"]);
  assert.deepEqual(a, { cowl: ["collections", "remittances"], curia: [] });
});

test("Curia receipt custody and independent treasury review remain distinct", () => {
  const a = calculateFinanceAccess(["curia_receipt_custodian"]);
  assert.deepEqual(a.cowl, []);
  assert.deepEqual(a.curia, ["inventory", "remittances"]);
  const b = calculateFinanceAccess(["curia_treasury_reviewer"]);
  assert.deepEqual(b.curia, ["remittances"]);
});

test("unknown, user-metadata-looking, and duplicate roles cannot escalate access", () => {
  const a = calculateFinanceAccess(["admin", "curia_admin", "cowl_finance_verifier", "cowl_finance_verifier", "anything"]);
  assert.deepEqual(a.cowl, ["collections"]);
  assert.deepEqual(a.curia, []);
  assert.equal(isFinancialRoleCode("admin"), false);
});

test("combined COWL and Curia grants expose both but no ungranted sections", () => {
  const a = calculateFinanceAccess(["cowl_receipt_issuer", "curia_treasury_reviewer"]);
  assert.deepEqual(a.cowl, ["inventory", "collections"]);
  assert.deepEqual(a.curia, ["remittances"]);
  assert.equal(financePath("curia", "remittances"), "/curia/remittances");
  assert.match(financeRolesLabel(["curia_treasury_reviewer"], "curia"), /Curia Treasury Reviewer/);
});
