const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../lib/signature-layout.ts");
const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(js, filename);
const { fitSignatoryLine, signatureInkPlacement, effectiveSignatureOffset } = mod.exports;

test("lengthy name fits completely rather than acquiring an ellipsis", () => {
  const factor = fitSignatoryLine(240, 164);
  assert.equal(factor, 164 / 240);
  assert.ok(factor > 0 && factor < 1);
});
test("already fitting names remain full size", () => {
  assert.equal(fitSignatoryLine(120, 164), 1);
});
test("invalid measurements leave typography unchanged", () => {
  assert.equal(fitSignatoryLine(NaN, 180), 1);
  assert.equal(fitSignatoryLine(180, 0), 1);
});
test("same normalized layout applies at different signatory block sizes", () => {
  const preset = { x: 0.15, y: 0.2, scale: 1.25 };
  const small = signatureInkPlacement(180, 90, 12, 10, 180, 40, 12, preset);
  const large = signatureInkPlacement(320, 160, 12, 10, 180, 40, 12, preset);
  const smallBaseline = signatureInkPlacement(180, 90, 12, 10, 180, 40, 12);
  const largeBaseline = signatureInkPlacement(320, 160, 12, 10, 180, 40, 12);
  assert.equal(small.left + small.width / 2 - (smallBaseline.left + smallBaseline.width / 2), 180 * preset.x);
  assert.equal(large.left + large.width / 2 - (largeBaseline.left + largeBaseline.width / 2), 320 * preset.x);
});
test("legacy 4px offsets still migrate to 12px", () => {
  assert.equal(effectiveSignatureOffset({ signature_offset: 4 }), 12);
  assert.equal(effectiveSignatureOffset({ signature_offset: 4, signature_offset_version: 2 }), 4);
});
