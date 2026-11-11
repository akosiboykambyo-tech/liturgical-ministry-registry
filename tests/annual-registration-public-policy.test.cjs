const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const source = path.resolve(__dirname, "../lib/verification-public-status.ts");
const js = ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = new Module(source, module);
m.filename = source;
m.paths = module.paths;
m._compile(js, source);
const policy = m.exports;
const assignment = (status, expiration_date) => ({ ministry: "Ministry of Lectors and Commentators", status, expiration_date });

test("missing expiration is never current or Registered", () => {
  const value = assignment("Renewed", null);
  assert.equal(policy.isCurrentMembership(value), false);
  assert.equal(policy.getMembershipPublicStatus(value).label, "Validity not established");
  assert.equal(policy.getRecordPublicStatus([value]).label, "Validity not established");
});

test("pending and inactive take precedence over retained expired dates", () => {
  assert.equal(policy.getMembershipPublicStatus(assignment("Pending Verification", "2020-01-01")).label, "Pending review");
  assert.equal(policy.getMembershipPublicStatus(assignment("Inactive", "2020-01-01")).label, "Not currently active");
  assert.equal(policy.isCurrentMembership(assignment("Inactive", "2099-01-01")), false);
});

test("current coverage and near-expiring coverage remain eligible", () => {
  const today = policy.todayInManila();
  assert.equal(policy.isCurrentMembership(assignment("New", today)), true);
  assert.equal(policy.getMembershipPublicStatus(assignment("Renewed", today)).label, "Registered");
  assert.equal(policy.isCurrentMembership(assignment("Renewed", "2099-01-01")), true);
});

test("expired or malformed dates cannot be treated as current", () => {
  assert.equal(policy.isCurrentMembership(assignment("New", "2020-01-01")), false);
  assert.match(policy.getMembershipPublicStatus(assignment("Renewed", "2020-01-01")).label, /Registration ended/);
  assert.equal(policy.isCurrentMembership(assignment("New", "2026-02-30")), false);
  assert.equal(policy.getMembershipPublicStatus(assignment("New", "2026-02-30")).label, "Validity not established");
});

test("multiple ministry assignments stay independent", () => {
  const registrations = [assignment("Renewed", "2099-01-01"), assignment("New", null)];
  assert.equal(policy.getRecordPublicStatus(registrations).label, "Registered for 1 of 2 ministries");
});

test("Manila date rolls over independently from UTC", () => {
  assert.equal(policy.todayInManila(new Date("2026-11-11T16:00:01Z")), "2026-11-12");
  assert.equal(policy.todayInManila(new Date("2026-11-11T15:59:59Z")), "2026-11-11");
});
