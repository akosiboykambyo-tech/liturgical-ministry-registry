const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/financial-stewardship/staging-workspaces.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { workspacesForRoles } = mod.exports;

test("COWL financial test viewer opens COWL and never Curia", () => {
  assert.deepEqual(workspacesForRoles(["cowl_financial_workspace_viewer"]), ["cowl"]);
});

test("Curia financial test viewer opens Curia and never COWL", () => {
  assert.deepEqual(workspacesForRoles(["curia_financial_workspace_viewer"]), ["curia"]);
});

test("both view-only grants require a workspace choice", () => {
  assert.deepEqual(workspacesForRoles([
    "cowl_financial_workspace_viewer", "curia_financial_workspace_viewer",
  ]), ["cowl", "curia"]);
});

test("registry-only and unknown metadata strings cannot grant financial access", () => {
  assert.deepEqual(workspacesForRoles(["admin", "cowl_registry_reviewer", "role=curia_admin"]), []);
});

test("existing operational test staff still route as before", () => {
  assert.deepEqual(workspacesForRoles(["cowl_receipt_issuer"]), ["cowl"]);
  assert.deepEqual(workspacesForRoles(["curia_receipt_custodian"]), ["curia"]);
});

test("repeated role strings do not duplicate workspaces", () => {
  assert.deepEqual(workspacesForRoles([
    "curia_financial_workspace_viewer", "curia_financial_workspace_viewer",
  ]), ["curia"]);
});
