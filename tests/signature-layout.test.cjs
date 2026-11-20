const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/signature-layout.ts");
const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(js, filename);
const { DEFAULT_SIGNATURE_OFFSET, effectiveSignatureOffset, upgradeSignatoryOffsets, signatoryLayout } = mod.exports;

test("default overlap for new signatories is 12px", () => {
  assert.equal(DEFAULT_SIGNATURE_OFFSET, 12);
  assert.equal(effectiveSignatureOffset({ signature_offset: 12, signature_offset_version: 2 }), 12);
});
test("legacy 4px and missing offsets upgrade to 12px", () => {
  assert.equal(effectiveSignatureOffset({ signature_offset: 4 }), 12);
  assert.equal(effectiveSignatureOffset({}), 12);
});
test("legacy customized offsets do not change", () => {
  for (const n of [9, 0, -5]) assert.equal(effectiveSignatureOffset({ signature_offset: n }), n);
});
test("new explicit choice of 4px is respected", () => {
  assert.equal(effectiveSignatureOffset({ signature_offset: 4, signature_offset_version: 2 }), 4);
});
test("in-memory migration preserves position, other fields, and input", () => {
  const elements = [
    { type: "signatory", id: "a", x: 60, y: 720, width: 150, signature_offset: 4 },
    { type: "signatory", id: "b", x: 70, y: 710, signature_offset: 8 },
    { type: "signatory", id: "c", signature_offset: 4, signature_offset_version: 2 },
    { type: "text", id: "d", x: 5 }
  ];
  const migrated = upgradeSignatoryOffsets(elements);
  assert.deepEqual(migrated, [
    { ...elements[0], signature_offset: 12, signature_offset_version: 2 },
    { ...elements[1], signature_offset_version: 2 },
    elements[2], elements[3]
  ]);
  assert.equal(elements[0].signature_offset, 4);
  assert.deepEqual(upgradeSignatoryOffsets(migrated), migrated);
});
test("12px lowers signature 8px relative to old 4px without moving name/title", () => {
  const old = signatoryLayout(90, 12, 10, 4);
  const updated = signatoryLayout(90, 12, 10, 12);
  assert.equal(updated.signatureBottom - old.signatureBottom, 8);
  assert.equal(updated.nameY, old.nameY);
  assert.equal(updated.titleY, old.titleY);
});
