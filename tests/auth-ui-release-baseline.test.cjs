const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");

test("sign-in requires verified Registry administrator or server-verified Finance/Curia role", () => {
  const code = read("app/admin/page.tsx");
  assert.match(code, /rpc\(["']registration_is_admin["']\)/);
  assert.match(code, /registry\.data === true/);
  assert.match(code, /router\.replace\(["']\/admin\/dashboard["']\)/);
  assert.match(code, /\/api\/financial-stewardship\/access\?workspace=all/);
  assert.match(code, /Authorization:\s*["']Bearer ["']\s*\+\s*token/);
  assert.match(code, /\/admin\/access-pending/);
  assert.doesNotMatch(code, /if\s*\(!loading\s*&&\s*session\)\s*router\.replace\(["']\/admin\/dashboard["']\)/);
  const api = read("app/api/financial-stewardship/access/route.ts");
  assert.match(api, /auth\.getUser\(token\)/);
  assert.match(api, /fs_staff_grants/);
  assert.match(api, /respond\(403/);
});

test("established Registry navigation and access enforcement remain unchanged", () => {
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /desktopExpanded\s*=\s*hoverOpen\s*\|\|\s*focusOpen\s*\|\|\s*pinnedOpen/);
  assert.match(layout, /onMouseEnter/);
  assert.match(layout, /admin-mobile-sidebar/);
  assert.match(layout, /registryAccess/);
  assert.match(layout, /router\.replace\(["']\/admin\/access-pending["']\)/);
});

test("five account routes share the approved responsive auth shell", () => {
  const pages = [
    "app/admin/page.tsx",
    "app/admin/accept-invite/page.tsx",
    "app/admin/forgot-password/page.tsx",
    "app/admin/reset-password/page.tsx",
    "app/admin/reset-link-sent/page.tsx",
  ];
  pages.forEach(file => assert.match(read(file), /<AdminAuthShell\b/, file));
  const shell = read("components/admin-auth-ui.tsx");
  assert.match(shell, /church-facade-placeholder/);
  assert.match(shell, /Diocesan coat of arms/);
  assert.doesNotMatch(shell, /getSupabaseBrowserClient|registration_is_admin/);
});

test("invitation and password recovery still verify one-time challenges", () => {
  const invite = read("app/admin/accept-invite/page.tsx");
  assert.match(invite, /parseInviteChallenge/);
  assert.match(invite, /auth\.verifyOtp/);
  assert.match(invite, /data\.user\.is_anonymous/);
  const reset = read("app/admin/reset-password/page.tsx");
  assert.match(reset, /type:\s*"recovery"/);
  assert.match(reset, /auth\.verifyOtp/);
  assert.match(reset, /token_hash/);
  assert.doesNotMatch(read("app/admin/reset-link-sent/page.tsx"), /setInterval|60\s*-\s*Math\.floor/);
});

test("PR81 access notice remains shared, but role denial distinguishes outages without standalone icon", () => {
  const page = read("app/admin/access-pending/page.tsx");
  const notice = read("components/admin-access-notice.tsx");
  assert.match(page, /<AdminAccessNotice/);
  assert.match(page, /showIcon=\{false\}/);
  assert.match(page, /Role approval required/);
  assert.match(page, /Access verification unavailable/);
  assert.match(page, /verificationUnavailable/);
  assert.doesNotMatch(page, /ShieldCheck|<svg\b/);
  assert.match(notice, /showIcon = true/);
  assert.match(notice, /showIcon && <ShieldCheck/);
});

test("PR81 public 403/404 pages and footer remain the single source of truth", () => {
  assert.match(read("app/403/page.tsx"), /status="403 · Access restricted"/);
  assert.match(read("app/not-found.tsx"), /status="404 · Page not found"/);
  assert.match(read("components/public-status-page.tsx"), /<RegistryFooter\s*\/>/);
  assert.doesNotMatch(read("app/403/page.tsx"), /public-error-page/);
});
