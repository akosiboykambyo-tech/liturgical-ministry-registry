const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const workspace = read("app/admin/verification/page.tsx");
const importer = read("app/admin/import/page.tsx");
const reviews = read("app/admin/renewal-reviews/page.tsx");
const verify = read("lib/verify-actions.ts");
const begin = importer.indexOf("const runImport = async");
const end = importer.indexOf("// RECONCILIATION ACTIONS", begin);
assert.ok(begin >= 0 && end > begin);
const registration = importer.slice(begin, end);

test("four tabs share one mounted CSV workspace", () => {
  for (const name of ["registrations", "renewals", "reviews", "history"]) {
    assert.ok(workspace.includes('key: "' + name + '"'));
  }
  assert.match(workspace, /<CsvImportPage\s*\/>/);
  assert.match(workspace, /hidden=\{!showCsv\}/);
});
test("registration failures restore UI and block uncertain replay", () => {
  assert.match(registration, /catch\s*\(cause\)/);
  assert.match(registration, /finally\s*\{/);
  assert.match(registration, /importInFlightRef\.current = false/);
  assert.match(registration, /setImportBlocked\(true\)/);
  assert.match(registration, /Do not retry this CSV/);
});
test("batch audit exists before database writes", () => {
  const idx = registration.indexOf("if (batchError || !batchRecord?.id)");
  assert.ok(idx >= 0 && idx < registration.indexOf("importMemberBatch("));
  assert.match(registration, /finishError/);
  assert.match(registration, /batchResults\.length !== slice\.length/);
});
test("import requires explicit acknowledgment of its writes", () => {
  assert.match(importer, /!importConfirmed/);
  assert.match(importer, /creates Pending Verification member records immediately/);
  assert.match(importer, /disabled=\{processing \|\| !importConfirmed \|\| importBlocked/);
});
test("duplicate queue is temporary and protected from accidental replacement", () => {
  assert.match(importer, /beforeunload/);
  assert.match(importer, /only in this browser session/);
  assert.match(registration, /setPendingMerges\(duplicates\)/);
  assert.match(workspace, /saved duplicate flags/);
});
test("renewal preview and final mutation remain distinct", () => {
  assert.match(importer, /const stageRenewalRoster = async/);
  assert.match(importer, /parishSet\.size !== 1/);
  assert.match(importer, /const processRenewalBatch = async/);
  assert.match(importer, /process_recommendation_renewal_batch/);
  assert.match(reviews, /Review decision recorded\. No member or ministry assignment was changed/);
});
test("history queries remain separate", () => {
  assert.match(workspace, /\.from\("import_batches"\)/);
  assert.match(importer, /\.from\("recommendation_renewal_batches"\)/);
});
test("member-wide verification remains a separate release gate", () => {
  assert.match(verify, /\.update\(\{ status: newStatus \}\)/);
});

test("renewal UI uses shared date-only validity helper and prevents manual overrides", () => {
  assert.match(importer, /import \{ expirationOneYearAfter \} from/);
  assert.match(importer, /return expirationOneYearAfter\(renewalDate\)/);
  assert.match(importer, /nextRenewalDate !== expectedNextRenewalDate/);
  assert.match(importer, /readOnly/);
});
