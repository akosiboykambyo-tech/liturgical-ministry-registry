"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root,file),"utf8");

const clientPaths = [
  "app/admin/members/page.tsx",
  "app/admin/members/[id]/page.tsx",
  "components/member-detail-drawer.tsx",
  "app/admin/import/page.tsx",
  "lib/duplicate-check.ts",
  "app/admin/verify/page.tsx",
  "lib/verify-actions.ts",
];

test("legacy registry screens never write directly to member/ministry/import tables", () => {
  for (const file of clientPaths) {
    const source = read(file);
    assert.doesNotMatch(source,
      /\.from\(["'](?:members|member_ministries|import_batches|duplicate_flags)["']\)\s*\.(?:insert|upsert|update|delete)\s*\(/,
      file + " must not bypass server authorization");
    assert.doesNotMatch(source,
      /\.from\(["'](?:members|member_ministries|import_batches|duplicate_flags)["']\)\s*\n?\s*\.(?:insert|upsert|update|delete)\s*\(/,
      file + " still contains direct mutation");
  }
});

test("member, duplicate and CSV entrypoints use a single administrator RPC wrapper", () => {
  for (const file of [
    "app/admin/members/page.tsx",
    "app/admin/members/[id]/page.tsx",
    "components/member-detail-drawer.tsx",
    "app/admin/import/page.tsx",
    "lib/duplicate-check.ts",
    "lib/verify-actions.ts",
  ]) assert.match(read(file), /registryAdminWrite\(/, file);
  assert.match(read("lib/registry-admin-writes.ts"), /registry_admin_member_write_v1/);
});

test("candidate RPC is allowlist-gated and keeps granular ministry/audit history", () => {
  const sql = read("docs/sql/pr55-legacy-crud-rpc.STAGING-FIRST.sql");
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /registry_private\.registration_administrators/);
  assert.match(sql, /FOR SHARE/);
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.registry_admin_member_write_v1\(text,jsonb\)/);
  assert.match(sql, /TO authenticated/);
  assert.match(sql, /p_action='create_batch'/);
  assert.match(sql, /EXCEPTION WHEN unique_violation/);
  assert.match(sql, /p_action IN \('renew','activate','detach'\)/);
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /recommendation_renewal_memberships/);
  assert.match(sql, /certificate_downloads/);
  assert.match(sql, /archived_documents/);
  assert.match(sql, /'Ministry of Lectors and Commentators'/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE) ON public\.members TO authenticated/i);
});

test("member deletion never removes a private letter before confirming database safety", () => {
  const page = read("app/admin/members/page.tsx");
  const start = page.indexOf("const handleDelete = async");
  assert.ok(start>=0);
  const section = page.slice(start,page.indexOf("return (",start));
  assert.match(section, /registryAdminWrite\("delete"/);
  assert.doesNotMatch(section, /storage\.from\("member-documents"\)\.remove/);
});

test("verification requires selected ministry's attached letter", () => {
  const quick = read("lib/verify-actions.ts");
  assert.match(quick, /eligible\.some\(\(a\) => !a\.document_url\)/);
  assert.match(quick, /registry_verify_ministries_v1/);
  assert.doesNotMatch(quick, /\.from\("members"\)\s*\.update/);
});
