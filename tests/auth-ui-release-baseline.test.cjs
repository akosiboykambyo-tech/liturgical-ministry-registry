const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("login sends a verified Registry administrator to the dashboard only after the role check", () => {
  const code = read("app/admin/page.tsx");
  assert.match(code, /rpc\(["']registration_is_admin["']\)/);
  assert.match(code, /registry\.data === true/);
  assert.match(code, /router\.replace\(["']\/admin\/dashboard["']\)/);
  assert.doesNotMatch(code, /if\s*\(!loading\s*&&\s*session\)\s*router\.replace\(["']\/admin\/dashboard["']\)/);
});

test("financial viewers route through the authenticated finance access endpoint", () => {
  const login = read("app/admin/page.tsx");
  const api = read("app/api/financial-stewardship/access/route.ts");
  assert.match(login, /\/api\/financial-stewardship\/access\?workspace=all/);
  assert.match(login, /Authorization:\s*["']Bearer ["']\s*\+\s*token/);
  assert.match(login, /data\.home/);
  assert.match(login, /\/admin\/access-pending/);
  assert.match(api, /auth\.getUser\(token\)/);
  assert.match(api, /fs_staff_grants/);
  assert.match(api, /respond\(403/);
});

test("the established collapsible Registry sidebar is retained", () => {
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /desktopExpanded\s*=\s*hoverOpen\s*\|\|\s*focusOpen\s*\|\|\s*pinnedOpen/);
  assert.match(layout, /onMouseEnter/);
  assert.match(layout, /admin-mobile-sidebar/);
  assert.match(layout, /registryAccess/);
  assert.match(layout, /router\.replace\(["']\/admin\/access-pending["']\)/);
});

test("role approval page has no standalone decorative icon", () => {
  const code = read("app/admin/access-pending/page.tsx");
  assert.doesNotMatch(code, /ShieldCheck|<svg\b/);
  assert.match(code, /Role approval required/);
  assert.match(code, /Access verification unavailable/);
});

test("shared 403 and 404 presentation files survive the baseline repair", () => {
  assert.match(read("app/403/page.tsx"), /status="403"/);
  assert.match(read("app/not-found.tsx"), /status="404"/);
  assert.match(read("components/public-error-page.tsx"), /<RegistryFooter\s*\/>/);
});
