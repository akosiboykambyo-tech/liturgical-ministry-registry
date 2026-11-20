const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const page = read("app/rc1-storage-qa/page.tsx");
const client = read("app/rc1-storage-qa/storage-qa-client.tsx");

test("Storage QA route is TEST Supabase and Vercel Preview gated", () => {
  assert.match(page, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(page, /hostname === "rtptybxugjhvpfjvcvgw\.supabase\.co"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /index: false, follow: false/);
});

test("Storage QA tests a synthetic image, not existing member files", () => {
  assert.match(client, /BUCKET = "member-documents"/);
  assert.match(client, /rc1-security-qa\//);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.match(client, /contentType: "image\/png"/);
  assert.match(client, /upsert: false/);
  assert.match(client, /matchesFixture\(read\.data\)/);
  assert.doesNotMatch(client, /\.from\("members"\)/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Private objects require real signed JWT for reads and URL issuance", () => {
  assert.match(client, /client\.auth\.getUser\(session\.data\.session\.access_token\)/);
  assert.match(client, /createClient\(/);
  assert.match(client, /persistSession: false, autoRefreshToken: false/);
  assert.match(client, /anonymousDownload/);
  assert.match(client, /anonymousLink/);
  assert.match(client, /\.download\(current\.path\)/);
  assert.match(client, /\.createSignedUrl\(current\.path, 60\)/);
  assert.match(client, /isAccessDenied\(/);
  assert.match(client, /"inconclusive"/);
});

test("Fixture cleanup and sanitized report do not expose signed URLs", () => {
  assert.match(client, /\.remove\(\[current\.path\]\)/);
  assert.match(client, /window\.localStorage\.removeItem\(STORAGE_KEY\)/);
  assert.match(client, /No signed URLs, object paths, access tokens/);
  assert.doesNotMatch(client, /clipboard\.writeText\(.*signedUrl/);
  assert.doesNotMatch(client, /console\.log|sendBeacon/);
});
