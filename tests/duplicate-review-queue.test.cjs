const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(file) {
  const filename = path.resolve(__dirname, "../lib", file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (request) => request === "./duplicate-review-plan"
    ? loadTs("duplicate-review-plan.ts")
    : require(request);
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const { summarizeReviewQueue, filterReviewQueue, previewQueueDecision } =
  loadTs("duplicate-review-queue.ts");

const caseA = {
  id: "case-A",
  incoming: { parish: "Parish A", ministries: ["Ministry of Liturgical Music"] },
  candidate: { id: "member-A", uid: "UID-A", parish: "Parish A", ministries: [] },
  createdAt: "2026-10-22T12:00:00Z",
  status: "open",
};
const caseB = {
  ...caseA, id: "case-B", status: "resolved", createdAt: "2026-10-20T12:00:00Z",
};
const note = "Reviewed person and parish details.";
const timestamp = "2026-10-23T02:00:00Z";

test("summarizes case status without counting assignments", () => {
  assert.deepEqual(summarizeReviewQueue([caseA, caseB]), {
    open: 1, resolved: 1, dismissed: 0, total: 2,
  });
});
test("filters status and sorts newest first", () => {
  assert.deepEqual(filterReviewQueue([caseB, caseA], "open").map((x) => x.id), ["case-A"]);
});
test("search filters across candidate UID and parish", () => {
  assert.deepEqual(filterReviewQueue([caseA, caseB], "all", "uid-a").length, 2);
  assert.deepEqual(filterReviewQueue([caseA], "open", "parish music").length, 1);
});
test("keeps existing identity and records an assignment plan", () => {
  const result = previewQueueDecision(caseA, "use_existing", note, timestamp);
  assert.equal(result.ok, true);
  assert.equal(result.updated.status, "resolved");
  assert.equal(result.updated.resolution.plan.uid, "UID-A");
  assert.deepEqual(result.updated.resolution.plan.newMinistries, ["Ministry of Liturgical Music"]);
  assert.equal(caseA.status, "open");
});
test("discard closes the case as dismissed without member writes", () => {
  const result = previewQueueDecision(caseA, "discard", note, timestamp);
  assert.equal(result.ok, true);
  assert.equal(result.updated.status, "dismissed");
});
test("cannot resolve an already closed case again", () => {
  assert.equal(previewQueueDecision(caseB, "discard", note, timestamp).ok, false);
});
test("requires a valid review timestamp and meaningful notes", () => {
  assert.equal(previewQueueDecision(caseA, "discard", note, "invalid").ok, false);
  assert.equal(previewQueueDecision(caseA, "discard", "short", timestamp).ok, false);
});
test("blocks silent cross-parish attachment", () => {
  const transfer = { ...caseA, incoming: { ...caseA.incoming, parish: "Parish B" } };
  assert.equal(previewQueueDecision(transfer, "use_existing", note, timestamp).ok, false);
});
