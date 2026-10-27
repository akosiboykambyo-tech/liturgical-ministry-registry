const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../lib/certificate-session-recovery.ts");
const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(js, filename);
const { withCertificateSessionRecovery, isExpiredJwtError, AdminReauthenticationRequiredError } = mod.exports;
const client = (refreshSession) => ({ auth: { refreshSession } });
test("recognizes JWT expiry, not unrelated RLS/schema errors", () => {
  assert.equal(isExpiredJwtError({ message: "JWT expired" }), true);
  assert.equal(isExpiredJwtError({ message: "permission denied" }), false);
  assert.equal(isExpiredJwtError({ message: "column updated_at does not exist" }), false);
});
test("nonexpired read needs no refresh", async () => {
  let refreshed = 0;
  const data = await withCertificateSessionRecovery(client(async () => { refreshed++; }), async () => ({ error: null, data: 5 }));
  assert.equal(data.data, 5);
  assert.equal(refreshed, 0);
});
test("expires, refreshes, retries once with a fresh query", async () => {
  let requests = 0, renewals = 0;
  const auth = client(async () => { renewals++; return { data: { session: { access_token: "fresh" } }, error: null }; });
  const result = await withCertificateSessionRecovery(auth, async () =>
    ++requests === 1 ? { error: { message: "JWT expired" } } : { error: null, data: 6 });
  assert.equal(result.data, 6);
  assert.equal(renewals, 1);
  assert.equal(requests, 2);
});
test("invalid refresh requires reauthentication instead of retry loop", async () => {
  let requests = 0;
  const auth = client(async () => ({ data: { session: null }, error: { message: "invalid token" } }));
  await assert.rejects(
    () => withCertificateSessionRecovery(auth, async () => { requests++; return { error: { message: "JWT expired" } }; }),
    (err) => err instanceof AdminReauthenticationRequiredError
  );
  assert.equal(requests, 1);
});
test("second expired JWT terminates after one retry", async () => {
  let calls = 0;
  const auth = client(async () => ({ data: { session: { access_token: "new" } }, error: null }));
  await assert.rejects(
    () => withCertificateSessionRecovery(auth, async () => { calls++; return { error: { message: "JWT expired" } }; }),
    (err) => err instanceof AdminReauthenticationRequiredError
  );
  assert.equal(calls, 2);
});
test("simultaneous expired queries share one refresh attempt", async () => {
  let renewals = 0, calls = 0;
  const auth = client(async () => {
    renewals++;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { data: { session: { access_token: "fresh" } }, error: null };
  });
  await Promise.all([1, 2, 3].map(() =>
    withCertificateSessionRecovery(auth, async () =>
      ++calls <= 3 ? { error: { message: "JWT expired" } } : { error: null })
  ));
  assert.equal(renewals, 1);
  assert.equal(calls, 6);
});
