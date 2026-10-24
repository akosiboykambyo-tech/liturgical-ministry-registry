const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../lib/secure-registration-gate.ts");
const transpiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = new Module(filename, module);
m.filename = filename;
m._compile(transpiled, filename);
const gate = m.exports.checkSecureRegistrationGate;
const ready = { enabled: "true", actorId: "admin", adminId: "admin", configuredRpc: "safe_atomic_intake" };
test("registration disabled by default", () => assert.deepEqual(gate({ ...ready, enabled: undefined }), { ok:false, reason:"disabled" }));
test("rejects missing identity", () => assert.deepEqual(gate({ ...ready, actorId: undefined }), { ok:false, reason:"unauthorized" }));
test("rejects non-admin identity", () => assert.deepEqual(gate({ ...ready, actorId: "visitor" }), { ok:false, reason:"unauthorized" }));
test("rejects missing atomic operation", () => assert.deepEqual(gate({ ...ready, configuredRpc: undefined }), { ok:false, reason:"unconfigured" }));
test("passes configured gate for authorized actor", () => assert.deepEqual(gate(ready), { ok:true }));
