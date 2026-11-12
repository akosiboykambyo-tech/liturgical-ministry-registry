const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const receipt = read("components/financial-stewardship/receipt-management-preview.tsx");
const portal = read("components/financial-stewardship/live-read-only-portal.tsx");
const route = read("app/financial-stewardship/receipt-management/page.tsx");
const access = read("lib/financial-stewardship/access-model.ts");

test("new receipt route inherits existing COWL collections grant, not a new financial role", () => {
  assert.match(route, /LiveFinancialStewardship section="collections" workspace="cowl"/);
  assert.match(portal, /isReceiptManagement = workspace === "cowl"/);
  assert.match(portal, /available\.includes\(item\.key\)/);
  assert.doesNotMatch(access, /receipt-management/);
});

test("no financial writing, official issuance or printing in draft UI", () => {
  assert.match(receipt, /Design preview only/);
  assert.match(receipt, /disabled type="button"/);
  assert.doesNotMatch(receipt, /getSupabaseBrowserClient|fetch\(|window\.print|localStorage|\.insert\(|\.update\(/);
});

test("receipt serial not placed in physical overlay mapping", () => {
  assert.match(receipt, /const DEFAULT_MAP/);
  const fields = receipt.match(/const DEFAULT_MAP: MapField\[\] = \[([\s\S]*?)\];/)?.[1];
  assert.ok(fields, "print fields list must exist");
  assert.doesNotMatch(fields, /serial|receiptNumber|receiptNo/);
  assert.match(receipt, /Received From is the parish; the ministry appears in Particulars only/);
});

test("approved physical custody policy and custom stock size are stated", () => {
  assert.match(receipt, /PAGE_WIDTH = 111\.76/);
  assert.match(receipt, /PAGE_HEIGHT = 170\.18/);
  assert.match(portal, /duplicate receipt copies held by COWL/);
  assert.doesNotMatch(portal, /duplicate receipt copies handed over/);
});

test("calibration draft is locked by default and discarded on exit", () => {
  assert.match(receipt, /useState\(false\)/);
  assert.match(receipt, /function discard\(\)/);
  assert.match(receipt, /tab === "calibration" && id !== "calibration"/);
  assert.match(receipt, /Publish &amp; print calibration \(not activated\)/);
});
