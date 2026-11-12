const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
test("QA route is dynamically server-gated to the exact TEST Supabase preview", () => {
  const page = read("app/release-qa/page.tsx");
  assert.match(page, /VERCEL_ENV\s*!==\s*"preview"/);
  assert.match(page, /NEXT_PUBLIC_SUPABASE_URL\s*!==/);
  assert.match(page, /https:\/\/rtptybxugjhvpfjvcvgw\.supabase\.co/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /dynamic\s*=\s*"force-dynamic"/);
});
test("QA uses real client JWT but never displays credentials or writes content", () => {
  const source = read("app/release-qa/release-qa-client.tsx");
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /Authorization:\s*"Bearer "\s*\+\s*accessToken/);
  assert.match(source, /financial-stewardship\/access\?workspace=cowl/);
  assert.match(source, /financial-stewardship\/access\?workspace=curia/);
  assert.match(source, /__release_qa_invalid_noop__/);
  assert.match(source, /registry_verify_ministries_v3/);
  assert.match(source, /storage\.from\(bucket\)\.list/);
  assert.doesNotMatch(source, /console\.log|localStorage|service_role|createSignedUrl|\.upload\(|\.download\(|\.updateUser\(|\.insert\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(source, /setResults\(.*access_token|report\s*=.*access_token/);
});
