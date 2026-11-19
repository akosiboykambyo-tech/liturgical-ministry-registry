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
  assert.match(layout, /staffLandingRoute\(/);
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

test("pending access and service outages share the approved sign-in layout", () => {
  const page = read("app/admin/access-pending/page.tsx");
  assert.match(page, /<AdminAuthShell\b/);
  assert.match(page, /authTitleClass/);
  assert.match(page, /authTextClass/);
  assert.match(page, /authStatusBoxClass/);
  assert.match(page, /authPrimaryButtonClass/);
  assert.match(page, /authSecondaryButtonClass/);
  assert.match(page, /Role approval required/);
  assert.match(page, /Access verification unavailable/);
  assert.match(page, /verificationUnavailable/);
  assert.match(page, /await signOut\(\)/);
  assert.doesNotMatch(page, /<AdminAccessNotice|ShieldCheck|CheckCircle2|<svg\b/);
});

test("password request results reuse a non-enumerating, icon-free shared component", () => {
  const request = read("app/admin/forgot-password/page.tsx");
  const sent = read("app/admin/reset-link-sent/page.tsx");
  const shared = read("components/admin-auth-ui.tsx");
  assert.match(request, /<PasswordResetEmailConfirmation\s*\/>/);
  assert.match(sent, /<PasswordResetEmailConfirmation\s*\/>/);
  assert.match(shared, /export function PasswordResetEmailConfirmation\(\)/);
  assert.match(shared, /If the email address matches a staff account/);
  assert.match(shared, /authTitleClass/);
  assert.match(shared, /authStatusBoxClass/);
  assert.match(shared, /authPrimaryButtonClass/);
  assert.doesNotMatch(request, /CheckCircle2/);
  assert.doesNotMatch(sent, /CheckCircle2/);
  assert.doesNotMatch(shared.slice(shared.indexOf("export function PasswordResetEmailConfirmation"), shared.indexOf("export function AuthError")), /<CheckCircle2|<ShieldCheck|<AlertCircle/);
  assert.match(request, /auth\.resetPasswordForEmail/);
});

test("live main 403/404 routes share the current public-error-page layout", () => {
  assert.match(read("app/403/page.tsx"), /status="403"/);
  assert.match(read("app/not-found.tsx"), /status="404"/);
  assert.match(read("app/403/page.tsx"), /public-error-page/);
  assert.match(read("app/not-found.tsx"), /public-error-page/);
  assert.match(read("components/public-error-page.tsx"), /<RegistryFooter\s*\/>/);
  assert.match(read("components/public-error-page.tsx"), /<RegistryHeader\s*\/>/);
});
