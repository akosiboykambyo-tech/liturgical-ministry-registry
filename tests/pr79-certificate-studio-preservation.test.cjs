const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("certificate save never reports successful zero-row writes", () => {
 const editor = read("app/admin/certificates/page.tsx");
 assert.match(editor, /\.select\("key"\)\.maybeSingle\(\)/);
 assert.match(editor, /persisted\?\.key !== key/);
 assert.match(editor, /Template settings were not saved to this database/);
});

test("certificate editor strips unused embedded base64 background on save", () => {
 const editor = read("app/admin/certificates/page.tsx");
 assert.match(editor, /field !== "background_data_url"/);
 assert.match(editor, /value: cleanSettings/);
 assert.match(editor, /Connected to Supabase TEST/);
 assert.match(editor, /no saved certificate templates/);
});

test("TEST-only restoration uses revocable administrator RLS and narrow keys", () => {
 const rls = read("docs/sql/pr79-test-certificate-studio-admin-write-rls.APPLIED.sql");
 assert.match(rls, /ON public\.system_settings FOR INSERT TO authenticated/);
 assert.match(rls, /ON public\.system_settings FOR UPDATE TO authenticated/);
 assert.match(rls, /ON public\.system_settings FOR DELETE TO authenticated/);
 assert.match(rls, /key LIKE 'certificate_template%'/);
 assert.match(rls, /key LIKE 'sig_layout_%'/);
 assert.match(rls, /SELECT public\.registration_is_admin\(\)/);
 assert.match(rls, /ON public\.signatories FOR INSERT TO authenticated/);
 assert.doesNotMatch(rls, /TO anon\s*;/);
});
