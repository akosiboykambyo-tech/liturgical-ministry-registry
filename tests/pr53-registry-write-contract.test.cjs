const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadWrite(mock) {
  const filename = path.join(root, "lib/registry-admin-writes.ts");
  const source = ts.transpileModule(read("lib/registry-admin-writes.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.require = (name) => name === "@/lib/supabase/client"
    ? { getSupabaseBrowserClient: () => ({ rpc: mock }) }
    : require(name);
  m._compile(source, filename);
  return m.exports.registryAdminWrite;
}

test("PR53 contract: missing secure RPC never falls back to direct member write", async () => {
  let calls = 0;
  const write = loadWrite(async (name, args) => {
    calls++;
    assert.equal(name, "registry_admin_member_write_v1");
    assert.equal(args.p_action, "create");
    return { data: null, error: { code: "PGRST202", message: "missing RPC" } };
  });
  await assert.rejects(write("create", { first_name: "Fictional" }), /not installed yet/i);
  assert.equal(calls, 1);
});

test("PR53 contract: denied server authorization rejects without client fallback", async () => {
  const write = loadWrite(async () => ({
    data: null, error: { code: "42501", message: "permission denied" },
  }));
  await assert.rejects(write("create", {}), /permission denied/);
});

for (const invalid of [null, [], "ok", 42]) {
  test("PR53 contract: malformed secure RPC response fails closed (" + String(invalid) + ")", async () => {
    const write = loadWrite(async () => ({ data: invalid, error: null }));
    await assert.rejects(write("create", {}), /Invalid secure registry response/);
  });
}

test("PR53 contract: only guarded RPC is referenced by the client write adapter", () => {
  const source = read("lib/registry-admin-writes.ts");
  assert.match(source, /supabase\.rpc\(/);
  assert.doesNotMatch(source, /\.from\([\s\S]*?\.(?:insert|update|delete)\(/);
});

test("PR53 gap sentinel: replay and race guarantees require live isolated RPC tests", () => {
  const source = read("lib/registry-admin-writes.ts");
  assert.match(source, /registry_admin_member_write_v1/);
  // This is NOT a concurrency test. See docs/audit/pr30-pr53-reconciliation.md.
});
