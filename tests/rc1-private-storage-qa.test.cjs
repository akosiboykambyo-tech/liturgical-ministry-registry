const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fullPath = (file) => path.join(__dirname, "..", file);
const read = (file) => fs.readFileSync(fullPath(file), "utf8");

// Final RC1 deliberately excludes browser QA harnesses from the deployable
// application; these release tests now assert the exclusion while retaining
// checks on the actual private-document workflow.
test("Temporary Storage QA pages and clients are absent from release source", () => {
  assert.equal(fs.existsSync(fullPath("app/rc1-storage-qa/page.tsx")), false);
  assert.equal(fs.existsSync(fullPath("app/rc1-storage-qa/storage-qa-client.tsx")), false);
});

test("Letters use private immutable Storage and assignment-scoped RPC", () => {
  const code = read("lib/registry-letter-attachments.ts");
  assert.match(code, /\.from\("member-documents"\)/);
  assert.match(code, /attachments\/\$\{crypto\.randomUUID\(\)\}/);
  assert.match(code, /upsert: false/);
  assert.match(code, /MAX_FILE_SIZE = 5 \* 1024 \* 1024/);
  assert.match(code, /registry_attach_ministry_letters_v2/);
  assert.doesNotMatch(code, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(code, /getPublicUrl\(/);
});

test("Private review link is short-lived and does not publicize letter storage", () => {
  const code = read("lib/secure-ministry-verification.ts");
  assert.match(code, /\.from\("member-documents"\)/);
  assert.match(code, /\.createSignedUrl\(documentPath, 300\)/);
  assert.match(code, /documentPath\.includes\("\.\."\)/);
  assert.doesNotMatch(code, /getPublicUrl\(/);
});
