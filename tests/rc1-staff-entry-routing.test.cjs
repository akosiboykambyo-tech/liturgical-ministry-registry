"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const raw = fs.readFileSync(path.join(root, "lib/staff-entry-routing.ts"), "utf8");
const compiled = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { module: mod, exports: mod.exports }, { timeout: 1000 });
const { staffLandingRoute } = mod.exports;
const finance = (home, status = 200, access = { cowl: ["inventory"], curia: [] }) => ({ home, status, access });

test("verified Registry admin retains Registry destination", () => {
  assert.equal(staffLandingRoute("granted", finance("/curia", 503)), "/admin/dashboard");
});
test("verified COWL viewer enters COWL even if Registry RPC is unavailable", () => {
  assert.equal(staffLandingRoute("unavailable", finance("/financial-stewardship")), "/financial-stewardship");
});
test("verified Curia viewer enters Curia even if Registry RPC is unavailable", () => {
  assert.equal(staffLandingRoute("unavailable", finance("/curia", 200, { cowl: [], curia: ["inventory"] })), "/curia");
});
test("dual finance scope enters chooser; no implied Registry access", () => {
  assert.equal(staffLandingRoute("denied", finance("/financial-stewardship", 200, { cowl: ["inventory"], curia: ["remittances"] })), "/financial-stewardship/workspaces");
});
test("neither scope nor trusted finance home can be spoofed by a 200 status", () => {
  assert.equal(staffLandingRoute("unavailable", finance("/admin/dashboard")), "/admin/access-pending?verification=unavailable");
  assert.equal(staffLandingRoute("denied", finance("/financial-stewardship", 200, { cowl: [], curia: [] })), "/admin/access-pending?verification=unavailable");
});
test("403 with proven non-admin means pending; Registry outage means unavailable", () => {
  assert.equal(staffLandingRoute("denied", { status: 403 }), "/admin/access-pending");
  assert.equal(staffLandingRoute("unavailable", { status: 403 }), "/admin/access-pending?verification=unavailable");
});
test("401, 503 and unexpected responses remain fail-closed", () => {
  for (const status of [0, 401, 500, 503]) {
    assert.equal(staffLandingRoute("denied", finance("/curia", status, { cowl: [], curia: ["inventory"] })), "/admin/access-pending?verification=unavailable");
  }
});
test("both login and admin layout consume shared entry decision", () => {
  const login = fs.readFileSync(path.join(root, "app/admin/page.tsx"), "utf8");
  const layout = fs.readFileSync(path.join(root, "app/admin/layout.tsx"), "utf8");
  for (const code of [login, layout]) {
    assert.match(code, /staffLandingRoute\(/);
    assert.match(code, /registry\.error \? "unavailable"/);
    assert.match(code, /\/api\/financial-stewardship\/access\?workspace=all/);
  }
});
