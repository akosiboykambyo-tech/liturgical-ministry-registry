const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Staff and Access is nested inside System Management, not top level", () => {
  const hub = read("app/admin/administration/page.tsx");
  const layout = read("app/admin/layout.tsx");
  const page = read("app/admin/staff-access/page.tsx");
  assert.match(hub, /href: "\/admin\/staff-access"/);
  assert.match(hub, /label: "Staff and Access"/);
  assert.match(layout, /pathname === "\/admin\/staff-access"/);
  assert.doesNotMatch(layout, /label: "STAFF AND ACCESS"/);
  assert.match(page, /System Management/);
  assert.match(page, /Staff and Access/);
  assert.match(page, /focus-visible:outline/);
  assert.match(page, /role=\{notice\.error \? "alert" : "status"\}/);
});

test("Staff directory never uses client-side service credentials", () => {
  const page = read("app/admin/staff-access/page.tsx");
  assert.match(page, /useAuth/);
  assert.match(page, /Authorization: "Bearer " \+ session\.access_token/);
  assert.doesNotMatch(page, /SUPABASE_SERVICE_ROLE_KEY|auth\.admin|createClient\(/);
  assert.doesNotMatch(page, /localStorage/);
});

test("Server requires independent Registry and Platform Provisioner authorization", () => {
  const api = read("app/api/admin/staff-access/route.ts");
  assert.match(api, /auth\.getUser\(token\)/);
  assert.match(api, /registration_is_admin/);
  assert.match(api, /platform_provisioner/);
  assert.match(api, /activeProvisioner/);
  assert.match(api, /staff_access_authorized_v1/);
  assert.match(api, /staff_access_roster_v1/);
  assert.match(api, /STAFF_ACCESS_MUTATIONS_ENABLED !== "true"/);
  assert.match(api, /request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
  assert.match(api, /roleCode\(payload\.role\)/);
  assert.match(api, /safeReason\(payload\.reason\)/);
  assert.match(api, /actor === targetId/);
  assert.match(api, /auth\.admin\.inviteUserByEmail/);
  assert.match(api, /account was invited, but the role was NOT assigned/);
  assert.doesNotMatch(api, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});

test("Database provisioning is service_role only and preserves last Registry admin", () => {
  const sql = read("docs/sql/staff-access-provisioning.REVIEW-ONLY.sql");
  assert.match(sql, /staff_access_authorized_v1/);
  assert.match(sql, /staff_access_roster_v1/);
  assert.match(sql, /staff_access_change_v1/);
  assert.match(sql, /CREATE TABLE registry_private\.staff_access_events/);
  assert.match(sql, /FROM registry_private\.registration_administrators/);
  assert.match(sql, /role_code = 'platform_provisioner'/);
  assert.match(sql, /p_actor = p_target/);
  assert.match(sql, /STAFF_ACCESS_LAST_REGISTRY_ADMIN/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.staff_access_change_v1/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.staff_access_change_v1[\s\S]*?TO service_role/);
  assert.match(sql, /staff_access_events[\s\S]*?occurred_at/);
});

test("Only three explicitly approved staff roles are exposed by this feature", () => {
  const api = read("app/api/admin/staff-access/route.ts");
  const page = read("app/admin/staff-access/page.tsx");
  const admin = [
    "registry_administrator",
    "cowl_financial_workspace_viewer",
    "curia_financial_workspace_viewer",
  ];
  for (const role of admin) {
    assert.ok(api.includes(role));
    assert.ok(page.includes(role));
  }
  assert.doesNotMatch(page, /"cowl_receipt_issuer"/);
  assert.doesNotMatch(page, /"curia_treasury_reviewer"/);
  assert.doesNotMatch(page, /"platform_provisioner"/);
});

test("Release docs require isolated SQL, negative role tests, and explicit approval", () => {
  const docs = read("docs/staff-and-access-release-gates.md");
  assert.match(docs, /DRAFT \/ NOT RELEASE-APPROVED/);
  assert.match(docs, /disposable, production-shaped, network-isolated clone/);
  assert.match(docs, /STAFF_ACCESS_MUTATIONS_ENABLED=true/);
  assert.match(docs, /last-active-Registry-admin/);
});
