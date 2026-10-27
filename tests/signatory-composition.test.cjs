const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const sourcePath = path.resolve(__dirname, "../lib/signature-layout.ts");
const js = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = module.paths;
mod._compile(js, sourcePath);
const { normalizeSignatureComposition, attachSignatureCompositions,
  signatureInkPlacement, effectiveSignatureOffset } = mod.exports;

test("default preset is centered and keeps original scale", () => {
  assert.deepEqual(normalizeSignatureComposition(undefined), { x: 0, y: 0, scale: 1 });
});
test("corrupt or excessive preset coordinates are clamped", () => {
  assert.deepEqual(normalizeSignatureComposition({ x: 99, y: -99, scale: 10 }),
    { x: 0.45, y: -0.45, scale: 2.5 });
  assert.deepEqual(normalizeSignatureComposition({ x: "bad", y: NaN, scale: null }),
    { x: 0, y: 0, scale: 1 });
});
test("layout join is by signatory ID, not position or ministry", () => {
  const members = [{ id: "sig-a", name: "Priest A" }, { id: "sig-b", name: "Priest B" }];
  const result = attachSignatureCompositions(members, [
    { key: "certificate_signatory_layout_sig-b", value: { x: 0.2, y: 0.1, scale: 1.2 } },
  ]);
  assert.equal(result[0].signature_layout, undefined);
  assert.deepEqual(result[1].signature_layout, { x: 0.2, y: 0.1, scale: 1.2 });
  assert.equal(members[1].signature_layout, undefined);
});
test("drag movement shifts image only, not name/title geometry", () => {
  const args = [180, 90, 12, 10, 150, 40, 12];
  const baseline = signatureInkPlacement(...args, { x: 0, y: 0, scale: 1 });
  const adjusted = signatureInkPlacement(...args, { x: 0.1, y: 0.2, scale: 1 });
  assert.equal(adjusted.left - baseline.left, 18);
  assert.equal(adjusted.top - baseline.top, 18);
  assert.equal(adjusted.width, baseline.width);
  assert.equal(adjusted.height, baseline.height);
});
test("artwork scale changes its dimensions independent of certificate element", () => {
  const args = [180, 90, 12, 10, 150, 40, 12];
  const base = signatureInkPlacement(...args, { x: 0, y: 0, scale: 1 });
  const enlarged = signatureInkPlacement(...args, { x: 0, y: 0, scale: 1.5 });
  assert.equal(enlarged.width / base.width, 1.5);
  assert.equal(enlarged.height / base.height, 1.5);
});
test("legacy overlap compatibility stays intact", () => {
  assert.equal(effectiveSignatureOffset({ signature_offset: 4 }), 12);
  assert.equal(effectiveSignatureOffset({ signature_offset: 4, signature_offset_version: 2 }), 4);
});
